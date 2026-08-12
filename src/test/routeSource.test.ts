import * as assert from 'assert';
import * as path from 'path';
import {
  canUseNodeFileSystem,
  resolveRouteSourcePath,
  type RouteSourceFileSystem,
} from '../routeSource';

function createFileSystem(
  workspaceRoot: string,
  files: string[],
  canonicalPaths: Map<string, string> = new Map(),
): RouteSourceFileSystem {
  const existingPaths = new Set([workspaceRoot, ...files, ...canonicalPaths.keys()]);
  const regularFiles = new Set(files);

  return {
    canonicalize(filePath) {
      if (!existingPaths.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return canonicalPaths.get(filePath) ?? filePath;
    },
    isFile(filePath) {
      return regularFiles.has(filePath);
    },
  };
}

describe('resolveRouteSourcePath', () => {
  const workspaceRoot = path.resolve('test-workspace');
  const routeTreePath = path.join(workspaceRoot, 'src', 'routeTree.gen.ts');

  it('resolves a normal relative route source inside the workspace', () => {
    const sourcePath = path.join(workspaceRoot, 'src', 'routes', 'index.tsx');
    const fileSystem = createFileSystem(workspaceRoot, [sourcePath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, './routes/index', fileSystem),
      sourcePath,
    );
  });

  it('resolves addExtensions imports that keep the source extension', () => {
    const sourcePath = path.join(workspaceRoot, 'src', 'routes', 'index.tsx');
    const fileSystem = createFileSystem(workspaceRoot, [sourcePath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, './routes/index.tsx', fileSystem),
      sourcePath,
    );
  });

  it('maps ESM .js import extensions back to TypeScript source files', () => {
    const sourcePath = path.join(workspaceRoot, 'src', 'routes', 'index.tsx');
    const fileSystem = createFileSystem(workspaceRoot, [sourcePath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, './routes/index.js', fileSystem),
      sourcePath,
    );
  });

  it('prefers an exact JavaScript source for explicit .js imports', () => {
    const javascriptPath = path.join(workspaceRoot, 'src', 'routes', 'index.js');
    const typescriptPath = path.join(workspaceRoot, 'src', 'routes', 'index.tsx');
    const fileSystem = createFileSystem(workspaceRoot, [javascriptPath, typescriptPath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, './routes/index.js', fileSystem),
      javascriptPath,
    );
  });

  it('preserves escaped literal dots in extensionless route imports', () => {
    const sourcePath = path.join(
      workspaceRoot,
      'src',
      'routes',
      'customScript[.]js.tsx',
    );
    const fileSystem = createFileSystem(workspaceRoot, [sourcePath]);

    assert.strictEqual(
      resolveRouteSourcePath(
        routeTreePath,
        workspaceRoot,
        './routes/customScript[.]js',
        fileSystem,
      ),
      sourcePath,
    );
  });

  it('allows parent segments that stay inside the owning workspace', () => {
    const generatedTreePath = path.join(workspaceRoot, 'generated', 'routeTree.gen.ts');
    const sourcePath = path.join(workspaceRoot, 'src', 'routes', 'index.ts');
    const fileSystem = createFileSystem(workspaceRoot, [sourcePath]);

    assert.strictEqual(
      resolveRouteSourcePath(generatedTreePath, workspaceRoot, '../src/routes/index', fileSystem),
      sourcePath,
    );
  });

  it('rejects traversal outside the owning workspace', () => {
    const outsidePath = path.resolve(workspaceRoot, '..', 'secret.tsx');
    const fileSystem = createFileSystem(workspaceRoot, [outsidePath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, '../../secret', fileSystem),
      undefined,
    );
  });

  it('rejects absolute import paths', () => {
    const outsideImport = path.resolve(workspaceRoot, '..', 'secret');
    const outsidePath = `${outsideImport}.tsx`;
    const fileSystem = createFileSystem(workspaceRoot, [outsidePath]);

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, outsideImport, fileSystem),
      undefined,
    );
  });

  it('rejects Windows drive, UNC, and mixed-separator traversal paths', () => {
    const windowsWorkspaceRoot = 'C:\\workspace';
    const windowsRouteTreePath = 'C:\\workspace\\src\\routeTree.gen.ts';
    const fileSystem = createFileSystem(windowsWorkspaceRoot, [
      'C:\\secret\\route.tsx',
      '\\\\attacker\\share\\route.tsx',
      'C:\\secret.tsx',
    ]);

    assert.strictEqual(
      resolveRouteSourcePath(
        windowsRouteTreePath,
        windowsWorkspaceRoot,
        'C:\\secret\\route',
        fileSystem,
        path.win32,
      ),
      undefined,
    );
    assert.strictEqual(
      resolveRouteSourcePath(
        windowsRouteTreePath,
        windowsWorkspaceRoot,
        '\\\\attacker\\share\\route',
        fileSystem,
        path.win32,
      ),
      undefined,
    );
    assert.strictEqual(
      resolveRouteSourcePath(
        windowsRouteTreePath,
        windowsWorkspaceRoot,
        './../..\\secret',
        fileSystem,
        path.win32,
      ),
      undefined,
    );
  });

  it('rejects a workspace symlink whose canonical target is outside', () => {
    const linkedPath = path.join(workspaceRoot, 'src', 'routes', 'linked.tsx');
    const outsidePath = path.resolve(workspaceRoot, '..', 'secret.tsx');
    const fileSystem = createFileSystem(
      workspaceRoot,
      [outsidePath],
      new Map([[linkedPath, outsidePath]]),
    );

    assert.strictEqual(
      resolveRouteSourcePath(routeTreePath, workspaceRoot, './routes/linked', fileSystem),
      undefined,
    );
  });
});

describe('canUseNodeFileSystem', () => {
  it('supports local and remote workspace extension hosts', () => {
    assert.strictEqual(canUseNodeFileSystem('file', 'file', undefined, false), true);
    assert.strictEqual(
      canUseNodeFileSystem('vscode-remote', 'vscode-remote', 'ssh-remote', true),
      true,
    );
  });

  it('rejects virtual, mismatched, and UI-hosted remote workspaces', () => {
    assert.strictEqual(canUseNodeFileSystem('vscode-vfs', 'vscode-vfs', undefined, false), false);
    assert.strictEqual(canUseNodeFileSystem('file', 'vscode-remote', 'ssh-remote', true), false);
    assert.strictEqual(
      canUseNodeFileSystem('vscode-remote', 'vscode-remote', 'ssh-remote', false),
      false,
    );
  });
});
