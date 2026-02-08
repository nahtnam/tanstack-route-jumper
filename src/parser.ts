import * as ts from 'typescript';

export interface RouteEntry {
  routePath: string;
  importPath: string;
}

export function parseRouteTree(sourceText: string): RouteEntry[] {
  const sourceFile = ts.createSourceFile(
    'routeTree.gen.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  // Step 1: ImportDeclarations → importMap: alias → modulePath
  const importMap = new Map<string, string>();

  // Step 2: VariableStatements with .update() → updateMap: varName → importAlias
  const updateMap = new Map<string, string>();

  // Step 3: VariableStatements with ._addFileChildren() → childrenMap: withChildrenName → baseName
  const childrenMap = new Map<string, string>();

  // Step 4: FileRoutesByFullPath interface → routePath → typeName
  const routesByFullPath: Array<{ routePath: string; typeName: string }> = [];

  for (const stmt of sourceFile.statements) {
    // Step 1: Import declarations
    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const modulePath = stmt.moduleSpecifier.text;
      const importClause = stmt.importClause;
      if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          const alias = element.name.text;
          importMap.set(alias, modulePath);
        }
      }
    }

    // Step 2 & 3: Variable statements
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) {
          continue;
        }
        const varName = decl.name.text;

        // Step 2: Check for .update() calls
        if (
          ts.isCallExpression(decl.initializer) &&
          ts.isPropertyAccessExpression(decl.initializer.expression) &&
          decl.initializer.expression.name.text === 'update' &&
          ts.isIdentifier(decl.initializer.expression.expression)
        ) {
          const importAlias = decl.initializer.expression.expression.text;
          updateMap.set(varName, importAlias);
        }

        // Step 3: Check for ._addFileChildren() calls
        if (
          ts.isCallExpression(decl.initializer) &&
          ts.isPropertyAccessExpression(decl.initializer.expression) &&
          decl.initializer.expression.name.text === '_addFileChildren' &&
          ts.isIdentifier(decl.initializer.expression.expression)
        ) {
          const baseName = decl.initializer.expression.expression.text;
          childrenMap.set(varName, baseName);
        }
      }
    }

    // Step 4: Interface named FileRoutesByFullPath
    if (
      ts.isInterfaceDeclaration(stmt) &&
      stmt.name.text === 'FileRoutesByFullPath'
    ) {
      for (const member of stmt.members) {
        if (
          ts.isPropertySignature(member) &&
          member.name &&
          member.type &&
          ts.isTypeQueryNode(member.type)
        ) {
          // Property: '/path': typeof SomeName
          let routePath: string;
          if (ts.isStringLiteral(member.name)) {
            routePath = member.name.text;
          } else {
            continue;
          }

          const typeName = member.type.exprName.getText(sourceFile);
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
