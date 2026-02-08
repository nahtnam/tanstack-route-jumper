import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseRouteTree } from './parser';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('tanstack-code.openRoute', async () => {
    const files = await vscode.workspace.findFiles('**/routeTree.gen.ts', '**/node_modules/**', 1);
    if (files.length === 0) {
      vscode.window.showWarningMessage('No routeTree.gen.ts found in this workspace.');
      return;
    }

    const routeTreeUri = files[0];
    const content = Buffer.from(await vscode.workspace.fs.readFile(routeTreeUri)).toString('utf-8');
    const routes = parseRouteTree(content);

    if (routes.length === 0) {
      vscode.window.showInformationMessage('No routes found in routeTree.gen.ts.');
      return;
    }

    const items = routes.map(r => ({
      label: r.routePath,
      description: r.importPath,
      importPath: r.importPath,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a route to open',
      matchOnDescription: true,
    });

    if (!selected) {
      return;
    }

    const routeTreeDir = path.dirname(routeTreeUri.fsPath);
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];
    let resolvedPath: string | undefined;

    for (const ext of extensions) {
      const candidate = path.resolve(routeTreeDir, selected.importPath + ext);
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }

    if (!resolvedPath) {
      vscode.window.showWarningMessage(`Could not find source file for route: ${selected.label}`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument(resolvedPath);
    await vscode.window.showTextDocument(doc);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
