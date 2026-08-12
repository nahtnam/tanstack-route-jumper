import { parentPort, workerData } from 'node:worker_threads';
import { parseRouteTree } from './parser.js';

if (!parentPort) {
  throw new Error('Route tree parser worker requires a parent port.');
}

try {
  const routes = parseRouteTree(String(workerData?.sourceText ?? ''));
  parentPort.postMessage({ ok: true, routes });
} catch {
  // Never send parser source, stack traces, or Acorn snippets across the
  // isolation boundary. The caller only needs a stable safe error category.
  parentPort.postMessage({
    ok: false,
    error: { code: 'parse-failed', message: 'Failed to parse route tree.' },
  });
}
