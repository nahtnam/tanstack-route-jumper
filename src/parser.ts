import * as acorn from 'acorn';

// acorn-typescript's exports field isn't compatible with Node16 moduleResolution
const tsPlugin = require('acorn-typescript');

export interface RouteEntry {
  routePath: string;
  importPath: string;
}

export const MAX_TOP_LEVEL_STATEMENTS = 50_000;
export const MAX_DISCOVERED_ROUTES = 10_000;
export const MAX_RESOLUTION_DEPTH = 256;

const tsParser = acorn.Parser.extend(tsPlugin.default());

interface GeneratedRoute {
  importAlias: string;
  path?: string;
  parent?: string;
}

/** Parse a generated TanStack route tree without evaluating its source. */
export function parseRouteTree(sourceText: string): RouteEntry[] {
  // TypeScript separates type and value namespaces, while Acorn's scope
  // checker does not. Keep the historical preprocessing for generated TS.
  let preprocessed = sourceText.replace(/^interface\s+\w+[\s\S]*?^\}/gm, '');
  preprocessed = preprocessed.replace(/^(export\s+)?(const|let)\s/gm, '$1var ');

  const program: any = tsParser.parse(preprocessed, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    locations: true,
  });

  const body: any[] = program.body ?? [];
  if (body.length > MAX_TOP_LEVEL_STATEMENTS) {
    throw new Error(`Route tree has too many top-level statements (maximum ${MAX_TOP_LEVEL_STATEMENTS})`);
  }

  const importMap = new Map<string, string>();
  const updateMap = new Map<string, string>();
  const childrenMap = new Map<string, string>();
  const generatedRoutes = new Map<string, GeneratedRoute>();
  const routesByFullPath: Array<{ routePath: string; typeName: string }> = [];
  let hasFileRoutesByFullPath = false;
  // Keep the historical behavior for incomplete TypeScript trees (without a
  // FileRoutesByFullPath interface). The generated-tree fallback is for the
  // JavaScript output shape, which has no TS assertions/interfaces.
  let hasTypeScriptSyntax = false;

  for (let stmt of body) {
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      stmt = stmt.declaration;
    }

    if (typeof stmt.type === 'string' && stmt.type.startsWith('TS')) {
      hasTypeScriptSyntax = true;
    }

    if (stmt.type === 'ImportDeclaration' && typeof stmt.source?.value === 'string') {
      const modulePath = stmt.source.value;
      for (const specifier of stmt.specifiers ?? []) {
        // Import aliases are intentionally recorded verbatim from the source
        // module specifier (including .js/.tsx extensions).
        if (specifier.local?.type === 'Identifier') {
          importMap.set(specifier.local.name, modulePath);
        }
      }
    }

    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations ?? []) {
        if (decl.id?.type !== 'Identifier' || !decl.init) {
          continue;
        }
        const varName = decl.id.name;

        const directCall = unwrapCall(decl.init);
        if (directCall?.callee?.type === 'MemberExpression') {
          const methodName = memberName(directCall.callee);
          const objectName = directCall.callee.object?.type === 'Identifier'
            ? directCall.callee.object.name
            : undefined;
          if (methodName === '_addFileChildren' && objectName) {
            childrenMap.set(varName, objectName);
          }
        }

        const updateCall = findUpdateCall(decl.init);
        if (!updateCall) {
          continue;
        }
        const updateArgument = updateCall.arguments?.[0];
        if (
          updateArgument?.type === 'TSAsExpression' ||
          updateArgument?.type === 'TSTypeAssertion'
        ) {
          hasTypeScriptSyntax = true;
        }
        const objectName = updateCall.callee.object?.type === 'Identifier'
          ? updateCall.callee.object.name
          : undefined;
        if (!objectName) {
          continue;
        }
        updateMap.set(varName, objectName);

        const route = readGeneratedRoute(updateArgument);
        if (route) {
          if (generatedRoutes.size >= MAX_DISCOVERED_ROUTES && !generatedRoutes.has(varName)) {
            throw new Error(`Route tree has too many discovered routes (maximum ${MAX_DISCOVERED_ROUTES})`);
          }
          generatedRoutes.set(varName, {
            importAlias: objectName,
            path: route.path,
            parent: route.parent,
          });
        }
      }
    }

    if (stmt.type === 'TSInterfaceDeclaration' && stmt.id?.name === 'FileRoutesByFullPath') {
      hasFileRoutesByFullPath = true;
      for (const member of stmt.body?.body ?? []) {
        if (routesByFullPath.length >= MAX_DISCOVERED_ROUTES) {
          throw new Error(`Route tree has too many discovered routes (maximum ${MAX_DISCOVERED_ROUTES})`);
        }
        if (
          member.type !== 'TSPropertySignature' ||
          member.key?.type !== 'Literal' ||
          typeof member.key.value !== 'string' ||
          member.typeAnnotation?.typeAnnotation?.type !== 'TSTypeQuery'
        ) {
          continue;
        }
        const exprName = member.typeAnnotation.typeAnnotation.exprName;
        if (exprName?.type !== 'Identifier') {
          continue;
        }
        routesByFullPath.push({ routePath: member.key.value, typeName: exprName.name });
      }
    }
  }

  const results: RouteEntry[] = [];
  if (hasFileRoutesByFullPath) {
    for (const { routePath, typeName } of routesByFullPath) {
      const importPath = resolveTypeName(typeName, childrenMap, updateMap, importMap);
      if (importPath) {
        results.push({ routePath, importPath });
      }
    }
  } else if (!hasTypeScriptSyntax) {
    const resolving = new Set<string>();
    const resolved = new Map<string, string | undefined>();
    for (const [name, route] of generatedRoutes) {
      if (route.path === undefined || route.path === '' || !importMap.has(route.importAlias)) {
        continue;
      }
      const routePath = resolveGeneratedPath(name, generatedRoutes, resolving, resolved, 0);
      if (routePath !== undefined) {
        results.push({ routePath, importPath: importMap.get(route.importAlias)! });
      }
    }
  }

  results.sort((a, b) => a.routePath.localeCompare(b.routePath));
  return results;
}

function unwrapExpression(expression: any): any {
  let current = expression;
  while (current && (current.type === 'ChainExpression' || current.type === 'TSAsExpression' || current.type === 'TSTypeAssertion')) {
    current = current.expression;
  }
  return current;
}

function unwrapCall(expression: any): any {
  const current = unwrapExpression(expression);
  return current?.type === 'CallExpression' ? current : undefined;
}

function memberName(member: any): string | undefined {
  if (member?.computed || member?.property?.type !== 'Identifier') {
    return undefined;
  }
  return member.property.name;
}

function findUpdateCall(expression: any): any | undefined {
  let current = unwrapExpression(expression);
  let depth = 0;
  while (current?.type === 'CallExpression' && depth++ < MAX_RESOLUTION_DEPTH) {
    const callee = current.callee;
    if (
      callee?.type === 'MemberExpression' &&
      memberName(callee) === 'update' &&
      readGeneratedRoute(current.arguments?.[0])
    ) {
      return current;
    }
    // Official generated files may wrap the route-defining update() in an
    // outer .lazy(...) or .update({ component }). Walk the receiver without
    // executing workspace code until the route-shaped update is found.
    if (callee?.type === 'MemberExpression') {
      current = unwrapExpression(callee.object);
    } else {
      break;
    }
  }
  if (current?.type === 'CallExpression' && depth >= MAX_RESOLUTION_DEPTH) {
    throw new Error(`Route tree resolution depth exceeds maximum ${MAX_RESOLUTION_DEPTH}`);
  }
  return undefined;
}

function readGeneratedRoute(argument: any): { path?: string; parent?: string } | undefined {
  const object = unwrapExpression(argument);
  if (object?.type !== 'ObjectExpression') {
    return undefined;
  }
  let path: string | undefined;
  let parent: string | undefined;
  for (const property of object.properties ?? []) {
    if (property.type !== 'Property' || property.computed) {
      continue;
    }
    const key = property.key?.type === 'Identifier' ? property.key.name : property.key?.value;
    if (key === 'path' && property.value?.type === 'Literal' && typeof property.value.value === 'string') {
      path = property.value.value;
    }
    if (key === 'getParentRoute') {
      const value = unwrapExpression(property.value);
      if (value?.type === 'ArrowFunctionExpression' && value.body?.type === 'Identifier') {
        parent = value.body.name;
      }
    }
  }
  // The update object is a route only when it has the generated route shape.
  return path !== undefined || parent !== undefined ? { path, parent } : undefined;
}

function resolveGeneratedPath(
  name: string,
  routes: Map<string, GeneratedRoute>,
  resolving: Set<string>,
  resolved: Map<string, string | undefined>,
  depth: number,
): string | undefined {
  if (depth > MAX_RESOLUTION_DEPTH) {
    throw new Error(`Route tree parent depth exceeds maximum ${MAX_RESOLUTION_DEPTH}`);
  }
  if (resolved.has(name)) {
    return resolved.get(name);
  }
  if (resolving.has(name)) {
    return undefined;
  }
  const route = routes.get(name);
  if (!route) {
    return '/';
  }
  resolving.add(name);
  const parentPath = route.parent
    ? (routes.has(route.parent)
      ? resolveGeneratedPath(route.parent, routes, resolving, resolved, depth + 1)
      : '/')
    : '/';
  if (parentPath === undefined) {
    resolving.delete(name);
    resolved.set(name, undefined);
    return undefined;
  }
  const routePath = combineRoutePath(parentPath, route.path);
  resolving.delete(name);
  resolved.set(name, routePath);
  return routePath;
}

function combineRoutePath(parentPath: string, path: string | undefined): string | undefined {
  if (path === undefined || path === '') {
    return parentPath;
  }
  if (path === '/') {
    return parentPath === '/' ? '/' : `${parentPath.replace(/\/$/, '')}/`;
  }
  const child = path.startsWith('/') ? path : `/${path}`;
  if (parentPath === '/') {
    return child;
  }
  return `${parentPath.replace(/\/$/, '')}${child}`;
}

function resolveTypeName(
  typeName: string,
  childrenMap: Map<string, string>,
  updateMap: Map<string, string>,
  importMap: Map<string, string>,
): string | undefined {
  let current = typeName;
  const seen = new Set<string>();
  let depth = 0;
  while (childrenMap.has(current)) {
    if (seen.has(current)) {
      break;
    }
    if (++depth > MAX_RESOLUTION_DEPTH) {
      throw new Error(`Route tree parent depth exceeds maximum ${MAX_RESOLUTION_DEPTH}`);
    }
    seen.add(current);
    current = childrenMap.get(current)!;
  }
  if (updateMap.has(current)) {
    current = updateMap.get(current)!;
  }
  return importMap.get(current);
}
