import * as acorn from 'acorn';

// acorn-typescript's exports field isn't compatible with Node16 moduleResolution
const tsPlugin = require('acorn-typescript');

export interface RouteEntry {
  routePath: string;
  importPath: string;
}

const tsParser = acorn.Parser.extend(tsPlugin.default());

export function parseRouteTree(sourceText: string): RouteEntry[] {
  // Preprocess generated route tree files to work around acorn's strict scope rules.
  // TypeScript separates type and value namespaces (so `interface Foo` + `const Foo` is
  // valid), but acorn treats both as scope bindings and throws on redeclaration.
  // 1. Strip non-exported interface blocks (we only need `export interface FileRoutesByFullPath`)
  // 2. Replace const/let with var to allow duplicate variable declarations
  let preprocessed = sourceText.replace(/^interface\s+\w+[\s\S]*?^\}/gm, '');
  preprocessed = preprocessed.replace(/^(export\s+)?(const|let)\s/gm, '$1var ');

  const program: any = tsParser.parse(preprocessed, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    locations: true,
  });

  // Step 1: ImportDeclarations → importMap: alias → modulePath
  const importMap = new Map<string, string>();

  // Step 2: VariableStatements with .update() → updateMap: varName → importAlias
  const updateMap = new Map<string, string>();

  // Step 3: VariableStatements with ._addFileChildren() → childrenMap: withChildrenName → baseName
  const childrenMap = new Map<string, string>();

  // Step 4: FileRoutesByFullPath interface → routePath → typeName
  const routesByFullPath: Array<{ routePath: string; typeName: string }> = [];

  for (let stmt of program.body) {
    // Unwrap export declarations to get the underlying declaration
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      stmt = stmt.declaration;
    }

    // Step 1: Import declarations
    if (
      stmt.type === 'ImportDeclaration' &&
      stmt.source &&
      typeof stmt.source.value === 'string'
    ) {
      const modulePath = stmt.source.value;
      for (const specifier of stmt.specifiers ?? []) {
        if (specifier.type === 'ImportSpecifier') {
          const alias = specifier.local.name;
          importMap.set(alias, modulePath);
        }
      }
    }

    // Step 2 & 3: Variable declarations
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (
          !decl.id ||
          decl.id.type !== 'Identifier' ||
          !decl.init
        ) {
          continue;
        }
        const varName = decl.id.name;

        // Check for calls like Foo.update() or Foo._addFileChildren()
        if (
          decl.init.type === 'CallExpression' &&
          decl.init.callee.type === 'MemberExpression' &&
          decl.init.callee.property.type === 'Identifier' &&
          decl.init.callee.object.type === 'Identifier'
        ) {
          const methodName = decl.init.callee.property.name;
          const objectName = decl.init.callee.object.name;

          // Step 2: .update() calls
          if (methodName === 'update') {
            updateMap.set(varName, objectName);
          }

          // Step 3: ._addFileChildren() calls
          if (methodName === '_addFileChildren') {
            childrenMap.set(varName, objectName);
          }
        }
      }
    }

    // Step 4: Interface named FileRoutesByFullPath
    if (
      stmt.type === 'TSInterfaceDeclaration' &&
      stmt.id.name === 'FileRoutesByFullPath'
    ) {
      for (const member of stmt.body.body) {
        if (
          member.type === 'TSPropertySignature' &&
          member.key &&
          member.typeAnnotation?.typeAnnotation
        ) {
          const typeAnnotation = member.typeAnnotation.typeAnnotation;
          if (typeAnnotation.type !== 'TSTypeQuery') {
            continue;
          }

          // Property key: '/path'
          let routePath: string;
          if (member.key.type === 'Literal' && typeof member.key.value === 'string') {
            routePath = member.key.value;
          } else {
            continue;
          }

          // typeof SomeName → exprName is an Identifier
          const exprName = typeAnnotation.exprName;
          let typeName: string;
          if (exprName.type === 'Identifier') {
            typeName = exprName.name;
          } else {
            continue;
          }

          routesByFullPath.push({ routePath, typeName });
        }
      }
    }
  }

  // Resolution: for each entry in FileRoutesByFullPath, follow the chain to get the import path
  const results: RouteEntry[] = [];

  for (const { routePath, typeName } of routesByFullPath) {
    const importPath = resolveTypeName(typeName, childrenMap, updateMap, importMap);
    if (importPath) {
      results.push({ routePath, importPath });
    }
  }

  results.sort((a, b) => a.routePath.localeCompare(b.routePath));

  return results;
}

function resolveTypeName(
  typeName: string,
  childrenMap: Map<string, string>,
  updateMap: Map<string, string>,
  importMap: Map<string, string>,
): string | undefined {
  // Follow childrenMap chain (could be multi-level)
  let current = typeName;
  const seen = new Set<string>();
  while (childrenMap.has(current)) {
    if (seen.has(current)) { break; }
    seen.add(current);
    current = childrenMap.get(current)!;
  }

  // Follow updateMap to get import alias
  if (updateMap.has(current)) {
    current = updateMap.get(current)!;
  }

  // Look up in importMap
  return importMap.get(current);
}
