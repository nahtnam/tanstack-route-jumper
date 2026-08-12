import * as assert from 'assert';
import {
  MAX_ROUTE_TREE_BYTES,
  parseRouteTreeInWorker,
  RouteTreeParseError,
} from '../parseRouteTreeInWorker';

const fixture = `
import { Route as rootRouteImport } from './routes/__root__.js'
import { Route as IndexRouteImport } from './routes/index.js'
const rootRoute = rootRouteImport.update({ id: '/', getParentRoute: () => rootRouteImport })
const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRoute })
`;

describe('parseRouteTreeInWorker', () => {
  it('parses a route tree successfully', async () => {
    assert.deepStrictEqual(await parseRouteTreeInWorker(fixture), [
      { routePath: '/', importPath: './routes/index.js' },
    ]);
  });

  it('rejects source over the byte cap before spawning', async () => {
    await assert.rejects(
      parseRouteTreeInWorker('x'.repeat(32), { maxBytes: 8 }),
      (error: unknown) => error instanceof RouteTreeParseError && error.code === 'too-large',
    );
    assert.ok(MAX_ROUTE_TREE_BYTES > 32);
  });

  it('rejects an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      parseRouteTreeInWorker(fixture, { signal: controller.signal }),
      (error: unknown) => error instanceof RouteTreeParseError && error.code === 'cancelled',
    );
  });

  it('rejects a zero timeout deterministically', async () => {
    await assert.rejects(
      parseRouteTreeInWorker(fixture, { timeoutMs: 0 }),
      (error: unknown) => error instanceof RouteTreeParseError && error.code === 'timed-out',
    );
  });
});
