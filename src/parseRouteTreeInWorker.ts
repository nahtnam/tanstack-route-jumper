import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { RouteEntry } from './parser.js';

export const MAX_ROUTE_TREE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3000;

export type RouteTreeParseErrorCode =
  | 'too-large'
  | 'timed-out'
  | 'cancelled'
  | 'parse-failed';

export class RouteTreeParseError extends Error {
  readonly code: RouteTreeParseErrorCode;

  constructor(code: RouteTreeParseErrorCode, message: string) {
    super(message);
    this.name = 'RouteTreeParseError';
    this.code = code;
  }
}

export interface ParseRouteTreeInWorkerOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

interface WorkerSuccess {
  ok: true;
  routes: RouteEntry[];
}

interface WorkerFailure {
  ok: false;
  error: {
    code?: unknown;
    message?: unknown;
  };
}

function parseFailure(message = 'Failed to parse route tree.') {
  return new RouteTreeParseError('parse-failed', message);
}

/** Parse a generated route tree in an isolated worker with bounded lifetime. */
export function parseRouteTreeInWorker(
  sourceText: string,
  options: ParseRouteTreeInWorkerOptions = {},
): Promise<RouteEntry[]> {
  const maxBytes = options.maxBytes ?? MAX_ROUTE_TREE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    return Promise.reject(parseFailure('Invalid route tree byte limit.'));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return Promise.reject(parseFailure('Invalid route tree timeout.'));
  }

  const byteLength = Buffer.byteLength(sourceText, 'utf8');
  if (byteLength > maxBytes) {
    return Promise.reject(new RouteTreeParseError(
      'too-large',
      `Generated route tree exceeds the ${maxBytes} byte limit.`,
    ));
  }
  if (options.signal?.aborted) {
    return Promise.reject(new RouteTreeParseError('cancelled', 'Route tree parsing was cancelled.'));
  }

  const workerPath = path.join(__dirname, 'parseRouteTreeWorker.js');
  const worker = new Worker(workerPath, { workerData: { sourceText } });

  return new Promise<RouteEntry[]>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
      }
      options.signal?.removeEventListener('abort', onAbort);
    };

    const stop = () => {
      // terminate() is idempotent and is intentionally called on every exit
      // path, including successful completion, so no worker is left running.
      void worker.terminate();
    };

    const fail = (error: RouteTreeParseError) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      stop();
      reject(error);
    };

    const succeed = (routes: RouteEntry[]) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      stop();
      resolve(routes);
    };

    const onAbort = () => fail(new RouteTreeParseError('cancelled', 'Route tree parsing was cancelled.'));

    worker.once('error', () => fail(parseFailure()));
    worker.once('exit', (code) => {
      if (!settled) {
        fail(parseFailure());
      }
    });
    worker.once('message', (message: WorkerSuccess | WorkerFailure) => {
      if (!message || typeof message !== 'object' || message.ok === undefined) {
        fail(parseFailure());
        return;
      }
      if (message.ok === true) {
        if (!Array.isArray(message.routes)) {
          fail(parseFailure());
          return;
        }
        succeed(message.routes);
        return;
      }
      fail(parseFailure());
    });

    options.signal?.addEventListener('abort', onAbort, { once: true });
    // Abort may have happened between the initial check and listener setup.
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    if (timeoutMs <= 0) {
      fail(new RouteTreeParseError('timed-out', 'Route tree parsing timed out.'));
    } else {
      timer = setTimeout(() => {
        fail(new RouteTreeParseError('timed-out', 'Route tree parsing timed out.'));
      }, timeoutMs);
    }
  });
}
