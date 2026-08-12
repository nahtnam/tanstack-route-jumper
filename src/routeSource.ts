import * as fs from 'fs';
import * as path from 'path';

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js'];

export interface RouteSourceFileSystem {
  canonicalize(filePath: string): string;
  isFile(filePath: string): boolean;
}

export interface RouteSourcePathApi {
  readonly sep: string;
  dirname(filePath: string): string;
  isAbsolute(filePath: string): boolean;
  relative(from: string, to: string): string;
  resolve(...pathSegments: string[]): string;
}

const localFileSystem: RouteSourceFileSystem = {
  canonicalize: filePath => fs.realpathSync.native(filePath),
  isFile: filePath => fs.statSync(filePath).isFile(),
};

function isPathWithin(
  rootPath: string,
  candidatePath: string,
  pathApi: RouteSourcePathApi,
): boolean {
  const relativePath = pathApi.relative(rootPath, candidatePath);
  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relativePath)
  );
}

export function canUseNodeFileSystem(
  routeTreeScheme: string,
  workspaceScheme: string,
  remoteName: string | undefined,
  isWorkspaceExtensionHost: boolean,
): boolean {
  if (routeTreeScheme !== workspaceScheme) {
    return false;
  }

  return routeTreeScheme === 'file' || (
    routeTreeScheme === 'vscode-remote' &&
    remoteName !== undefined &&
    isWorkspaceExtensionHost
  );
}

export function resolveRouteSourcePath(
  routeTreePath: string,
  workspaceRoot: string,
  importPath: string,
  fileSystem: RouteSourceFileSystem = localFileSystem,
  pathApi: RouteSourcePathApi = path,
): string | undefined {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
    return undefined;
  }

  const absoluteWorkspaceRoot = pathApi.resolve(workspaceRoot);
  let canonicalWorkspaceRoot: string;

  try {
    canonicalWorkspaceRoot = fileSystem.canonicalize(absoluteWorkspaceRoot);
  } catch {
    return undefined;
  }

  const routeTreeDir = pathApi.dirname(routeTreePath);

  for (const extension of sourceExtensions) {
    const candidatePath = pathApi.resolve(routeTreeDir, importPath + extension);

    // Reject lexical escapes before touching the candidate path. This also avoids
    // filesystem access to absolute or UNC paths supplied by workspace content.
    if (!isPathWithin(absoluteWorkspaceRoot, candidatePath, pathApi)) {
      continue;
    }

    try {
      const canonicalCandidatePath = fileSystem.canonicalize(candidatePath);
      if (
        isPathWithin(canonicalWorkspaceRoot, canonicalCandidatePath, pathApi) &&
        fileSystem.isFile(canonicalCandidatePath)
      ) {
        return canonicalCandidatePath;
      }
    } catch {
      // Try the next supported source extension when this candidate does not exist.
    }
  }

  return undefined;
}
