#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedName = `tanstack-route-jumper-${packageJson.version}.vsix`;
const archive = resolve(process.argv[2] ?? expectedName);

if (!existsSync(archive)) {
  console.error(`VSIX not found: ${archive}`);
  process.exit(1);
}

let entries;
try {
  entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
} catch (error) {
  console.error(`Unable to inspect ${basename(archive)} with unzip.`);
  process.exit(1);
}

const entrySet = new Set(entries);
const required = [
  'extension/package.json',
  'extension.vsixmanifest',
  '[Content_Types].xml',
  'extension/LICENSE.txt',
  'extension/icon.png',
  'extension/out/extension.js',
  'extension/out/parser.js',
  'extension/out/routeSource.js',
  'extension/out/parseRouteTreeInWorker.js',
  'extension/out/parseRouteTreeWorker.js',
  'extension/node_modules/acorn/package.json',
  'extension/node_modules/acorn/LICENSE',
  'extension/node_modules/acorn/dist/acorn.js',
  'extension/node_modules/acorn-typescript/package.json',
  'extension/node_modules/acorn-typescript/LICENSE',
  'extension/node_modules/acorn-typescript/lib/index.js',
];
const missing = required.filter((entry) => !entrySet.has(entry));
if (missing.length) {
  console.error(`VSIX content check failed; missing: ${missing.join(', ')}`);
  process.exit(1);
}

const forbidden = entries.filter((entry) => {
  const extensionFile = entry.startsWith('extension/') && !entry.startsWith('extension/node_modules/');
  const dependencyArtifact = entry.startsWith('extension/node_modules/') &&
    /(^|\/)(?:README|CHANGELOG)[^/]*$|\/bin\/|\/dist\/bin\.js$|\/lib\/index\.mjs$|\/dist\/acorn\.mjs$|\.(?:map|d\.(?:ts|mts|cts))$/.test(entry);
  return dependencyArtifact || (
    extensionFile &&
    /(^|\/)(src|scripts|\.github|\.vscode|test)(\/|$)|package-lock\.json$|tsconfig\.json$|eslint\.config\.mjs$|\.(?:map|ts|d\.(?:ts|mts|cts))$|\.vsix$/.test(entry)
  );
});
if (forbidden.length) {
  console.error(`VSIX content check failed; forbidden entries: ${forbidden.join(', ')}`);
  process.exit(1);
}

console.log(`VSIX content check passed: ${entries.length} entries; runtime files and dependency licenses present.`);
