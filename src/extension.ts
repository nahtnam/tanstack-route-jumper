import * as vscode from 'vscode';
import {
  MAX_ROUTE_TREE_BYTES,
  parseRouteTreeInWorker,
  RouteTreeParseError,
} from './parseRouteTreeInWorker';
import { canUseNodeFileSystem, resolveRouteSourcePath } from './routeSource';

const routeTreePattern = '**/routeTree.gen.{ts,js}';
const routeTreeExcludePattern =
  '**/{node_modules,.git,.hg,.svn,.yarn,.pnpm-store,out,dist,build,coverage}/**';
const maxRouteTreesPerWorkspaceFolder = 50;

let log: vscode.LogOutputChannel;

class TooManyRouteTreesError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function selectWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage(
      'Open a folder or workspace before using TanStack Route Jumper.',
    );
    return undefined;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  return vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Select the workspace folder that contains your TanStack Router project',
  });
}

async function findRouteTrees(
  workspaceFolder: vscode.WorkspaceFolder,
  token: vscode.CancellationToken,
): Promise<vscode.Uri[]> {
  const matches = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, routeTreePattern),
    routeTreeExcludePattern,
    maxRouteTreesPerWorkspaceFolder + 1,
    token,
  );

  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  if (matches.length > maxRouteTreesPerWorkspaceFolder) {
    throw new TooManyRouteTreesError(
      `More than ${maxRouteTreesPerWorkspaceFolder} generated route trees were found in ${workspaceFolder.name}.`,
    );
  }

  return matches.sort((left, right) => left.toString().localeCompare(right.toString()));
}

async function selectRouteTree(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<vscode.Uri | undefined> {
  const routeTrees = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Finding generated route trees in ${workspaceFolder.name}`,
      cancellable: true,
    },
    (_progress, token) => findRouteTrees(workspaceFolder, token),
  );

  if (routeTrees.length === 0) {
    vscode.window.showInformationMessage(
      `No routeTree.gen.ts or routeTree.gen.js file was found in ${workspaceFolder.name}.`,
    );
    return undefined;
  }

  if (routeTrees.length === 1) {
    return routeTrees[0];
  }

  const selected = await vscode.window.showQuickPick(
    routeTrees.map(uri => ({
      label: vscode.workspace.asRelativePath(uri, false),
      description: uri.path.endsWith('.js') ? 'JavaScript' : 'TypeScript',
      uri,
    })),
    {
      placeHolder: 'Select the generated route tree to use',
      matchOnDescription: true,
    },
  );

  return selected?.uri;
}

async function readAndParseRouteTree(routeTreeUri: vscode.Uri) {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Parsing ${routeTreeUri.path.split('/').pop() ?? 'generated route tree'}`,
      cancellable: true,
    },
    async (_progress, token) => {
      const abortController = new AbortController();
      const cancellation = token.onCancellationRequested(() => abortController.abort());

      try {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }

        const stat = await vscode.workspace.fs.stat(routeTreeUri);
        if (stat.size > MAX_ROUTE_TREE_BYTES) {
          throw new RouteTreeParseError(
            'too-large',
            `Generated route tree exceeds the ${MAX_ROUTE_TREE_BYTES} byte limit.`,
          );
        }

        const bytes = await vscode.workspace.fs.readFile(routeTreeUri);
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }

        const sourceText = Buffer.from(bytes).toString('utf-8');
        return await parseRouteTreeInWorker(sourceText, {
          signal: abortController.signal,
        });
      } finally {
        cancellation.dispose();
      }
    },
  );
}

function showParseFailure(error: RouteTreeParseError) {
  switch (error.code) {
    case 'too-large':
      vscode.window.showWarningMessage(
        'The generated route tree is too large to parse safely.',
      );
      break;
    case 'timed-out':
      vscode.window.showWarningMessage(
        'Parsing the generated route tree took too long and was stopped.',
      );
      break;
    case 'parse-failed':
      vscode.window.showWarningMessage(
        'The generated route tree could not be parsed. Regenerate it and try again.',
      );
      break;
    case 'cancelled':
      break;
  }
}

async function openRoute(context: vscode.ExtensionContext) {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage(
      'Trust this workspace before using TanStack Route Jumper.',
    );
    return;
  }

  try {
    const selectedWorkspaceFolder = await selectWorkspaceFolder();
    if (!selectedWorkspaceFolder) {
      return;
    }

    const routeTreeUri = await selectRouteTree(selectedWorkspaceFolder);
    if (!routeTreeUri) {
      return;
    }

    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(routeTreeUri) ?? selectedWorkspaceFolder;
    const isWorkspaceExtensionHost =
      context.extension.extensionKind === vscode.ExtensionKind.Workspace;
    if (!canUseNodeFileSystem(
      routeTreeUri.scheme,
      workspaceFolder.uri.scheme,
      vscode.env.remoteName,
      isWorkspaceExtensionHost,
    )) {
      log.warn(`Cannot resolve route sources from workspace URI: ${routeTreeUri.toString()}`);
      vscode.window.showWarningMessage(
        'Route source files cannot be opened from this workspace provider.',
      );
      return;
    }

    log.info(`Using generated route tree at ${routeTreeUri.toString()}`);
    const routes = await readAndParseRouteTree(routeTreeUri);
    log.info(`Parsed ${routes.length} route(s)`);

    if (routes.length === 0) {
      vscode.window.showInformationMessage('No routes were found in the generated route tree.');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      routes.map(route => ({
        label: route.routePath,
        description: route.importPath,
        importPath: route.importPath,
      })),
      {
        placeHolder: 'Select a route to open',
        matchOnDescription: true,
      },
    );

    if (!selected) {
      return;
    }

    const resolvedPath = resolveRouteSourcePath(
      routeTreeUri.fsPath,
      workspaceFolder.uri.fsPath,
      selected.importPath,
    );

    if (!resolvedPath) {
      log.warn(
        `Could not resolve source file for route: ${selected.label} (import: ${selected.importPath})`,
      );
      vscode.window.showWarningMessage(
        `Could not find a contained source file for route: ${selected.label}`,
      );
      return;
    }

    const sourceUri = vscode.Uri.file(resolvedPath);
    const documentUri = routeTreeUri.scheme === 'file'
      ? sourceUri
      : sourceUri.with({
        scheme: routeTreeUri.scheme,
        authority: routeTreeUri.authority,
      });
    const document = await vscode.workspace.openTextDocument(documentUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    if (error instanceof vscode.CancellationError) {
      return;
    }

    if (error instanceof RouteTreeParseError) {
      log.warn(`Route tree parsing stopped: ${error.code}: ${error.message}`);
      showParseFailure(error);
      return;
    }

    if (error instanceof TooManyRouteTreesError) {
      log.warn(error.message);
      vscode.window.showWarningMessage(
        `${error.message} Narrow the workspace and try again.`,
      );
      return;
    }

    log.error(`TanStack Route Jumper failed: ${errorMessage(error)}`);
    vscode.window.showErrorMessage(
      'TanStack Route Jumper could not open the route. See the output log for details.',
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel('TanStack Route Jumper', { log: true });
  context.subscriptions.push(log);
  log.info('TanStack Route Jumper activated');

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'tanstack-route-jumper.openRoute',
      () => openRoute(context),
    ),
  );
}

export function deactivate() {}
