import * as vscode from 'vscode';
import { parseRouteTree } from './parser';
import { canUseNodeFileSystem, resolveRouteSourcePath } from './routeSource';

let log: vscode.LogOutputChannel;

export function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel('TanStack Route Jumper', { log: true });
  context.subscriptions.push(log);
  log.info('TanStack Route Jumper activated');

  const disposable = vscode.commands.registerCommand('tanstack-route-jumper.openRoute', async () => {
    const files = await vscode.workspace.findFiles('**/routeTree.gen.ts', '**/node_modules/**', 1);
    if (files.length === 0) {
      log.debug('No routeTree.gen.ts found in workspace, skipping');
      return;
    }

    const routeTreeUri = files[0];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(routeTreeUri);
    const isWorkspaceExtensionHost =
      context.extension.extensionKind === vscode.ExtensionKind.Workspace;
    if (!workspaceFolder || !canUseNodeFileSystem(
      routeTreeUri.scheme,
      workspaceFolder.uri.scheme,
      vscode.env.remoteName,
      isWorkspaceExtensionHost,
    )) {
      log.warn(`Cannot resolve route sources from workspace URI: ${routeTreeUri.toString()}`);
      vscode.window.showWarningMessage('Route source files cannot be opened from this workspace.');
      return;
    }

    log.info(`Found routeTree.gen.ts at ${routeTreeUri.fsPath}`);
    const content = Buffer.from(await vscode.workspace.fs.readFile(routeTreeUri)).toString('utf-8');
    const routes = parseRouteTree(content);
    log.info(`Parsed ${routes.length} route(s)`);

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

    const resolvedPath = resolveRouteSourcePath(
      routeTreeUri.fsPath,
      workspaceFolder.uri.fsPath,
      selected.importPath,
    );

    if (!resolvedPath) {
      log.warn(`Could not resolve source file for route: ${selected.label} (import: ${selected.importPath})`);
      vscode.window.showWarningMessage(`Could not find source file for route: ${selected.label}`);
      return;
    }

    const sourceUri = vscode.Uri.file(resolvedPath);
    const documentUri = routeTreeUri.scheme === 'file'
      ? sourceUri
      : sourceUri.with({
        scheme: routeTreeUri.scheme,
        authority: routeTreeUri.authority,
      });
    const doc = await vscode.workspace.openTextDocument(documentUri);
    await vscode.window.showTextDocument(doc);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
