import * as assert from 'assert';
import { parseRouteTree } from '../parser';

describe('parseRouteTree', () => {
  it('should parse a single simple route', () => {
    const source = `
import { Route as IndexRouteImport } from './routes/index'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/', importPath: './routes/index' },
    ]);
  });

  it('should parse multiple routes with dynamic params', () => {
    const source = `
import { Route as IndexRouteImport } from './routes/index'
import { Route as UsersUserIdRouteImport } from './routes/users/$userId'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)
const UsersUserIdRoute = UsersUserIdRouteImport.update({
  id: '/users/$userId',
  path: '/users/$userId',
  getParentRoute: () => rootRoute,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/users/$userId': typeof UsersUserIdRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/', importPath: './routes/index' },
      { routePath: '/users/$userId', importPath: './routes/users/$userId' },
    ]);
  });

  it('should parse splat routes', () => {
    const source = `
import { Route as ApiRpcSplatRouteImport } from './routes/api/rpc/$'

const ApiRpcSplatRoute = ApiRpcSplatRouteImport.update({
  id: '/api/rpc/$',
  path: '/api/rpc/$',
  getParentRoute: () => rootRoute,
} as any)

export interface FileRoutesByFullPath {
  '/api/rpc/$': typeof ApiRpcSplatRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/api/rpc/$', importPath: './routes/api/rpc/$' },
    ]);
  });

  it('should resolve WithChildren references', () => {
    const source = `
import { Route as WithUserRouteImport } from './routes/_with-user'
import { Route as WithUserAppIndexRouteImport } from './routes/_with-user/app/index'

const WithUserRoute = WithUserRouteImport.update({
  id: '/_with-user',
  getParentRoute: () => rootRoute,
} as any)
const WithUserAppIndexRoute = WithUserAppIndexRouteImport.update({
  id: '/app/',
  path: '/app/',
  getParentRoute: () => WithUserRoute,
} as any)

const WithUserRouteChildren = {
  WithUserAppIndexRoute: WithUserAppIndexRoute,
}

const WithUserRouteWithChildren = WithUserRoute._addFileChildren(
  WithUserRouteChildren,
)

export interface FileRoutesByFullPath {
  '/app': typeof WithUserRouteWithChildren
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/app', importPath: './routes/_with-user' },
    ]);
  });

  it('should parse pathless layout routes', () => {
    const source = `
import { Route as WithAuthRouteImport } from './routes/_with-auth'
import { Route as WithAuthDashboardRouteImport } from './routes/_with-auth/dashboard'

const WithAuthRoute = WithAuthRouteImport.update({
  id: '/_with-auth',
  getParentRoute: () => rootRoute,
} as any)
const WithAuthDashboardRoute = WithAuthDashboardRouteImport.update({
  id: '/dashboard',
  path: '/dashboard',
  getParentRoute: () => WithAuthRoute,
} as any)

export interface FileRoutesByFullPath {
  '/dashboard': typeof WithAuthDashboardRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/dashboard', importPath: './routes/_with-auth/dashboard' },
    ]);
  });

  it('should handle nested pathless layouts (multi-level prefix)', () => {
    const source = `
import { Route as AuthRouteImport } from './routes/_auth'
import { Route as AuthAdminRouteImport } from './routes/_auth/_admin'
import { Route as AuthAdminSettingsRouteImport } from './routes/_auth/_admin/settings'

const AuthRoute = AuthRouteImport.update({
  id: '/_auth',
  getParentRoute: () => rootRoute,
} as any)
const AuthAdminRoute = AuthAdminRouteImport.update({
  id: '/_admin',
  getParentRoute: () => AuthRoute,
} as any)
const AuthAdminSettingsRoute = AuthAdminSettingsRouteImport.update({
  id: '/settings',
  path: '/settings',
  getParentRoute: () => AuthAdminRoute,
} as any)

const AuthAdminRouteChildren = {
  AuthAdminSettingsRoute: AuthAdminSettingsRoute,
}

const AuthAdminRouteWithChildren = AuthAdminRoute._addFileChildren(
  AuthAdminRouteChildren,
)

const AuthRouteChildren = {
  AuthAdminRoute: AuthAdminRouteWithChildren,
}

const AuthRouteWithChildren = AuthRoute._addFileChildren(
  AuthRouteChildren,
)

export interface FileRoutesByFullPath {
  '/settings': typeof AuthAdminSettingsRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/settings', importPath: './routes/_auth/_admin/settings' },
    ]);
  });

  it('should handle index route under a layout', () => {
    const source = `
import { Route as AppRouteImport } from './routes/app'
import { Route as AppIndexRouteImport } from './routes/app/index'

const AppRoute = AppRouteImport.update({
  id: '/app',
  path: '/app',
  getParentRoute: () => rootRoute,
} as any)
const AppIndexRoute = AppIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => AppRoute,
} as any)

const AppRouteChildren = {
  AppIndexRoute: AppIndexRoute,
}

const AppRouteWithChildren = AppRoute._addFileChildren(
  AppRouteChildren,
)

export interface FileRoutesByFullPath {
  '/app': typeof AppRouteWithChildren
  '/app/': typeof AppIndexRoute
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/app', importPath: './routes/app' },
      { routePath: '/app/', importPath: './routes/app/index' },
    ]);
  });

  it('should return empty array for empty FileRoutesByFullPath', () => {
    const source = `
export interface FileRoutesByFullPath {
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array when FileRoutesByFullPath is missing', () => {
    const source = `
import { Route as IndexRouteImport } from './routes/index'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, []);
  });

  it('should handle interface + const same name, declare module, import type, multi-line update, and flat routes', () => {
    const source = `
/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './routes/__root'
import { Route as UsersRouteImport } from './routes/users'
import { Route as PostsRouteImport } from './routes/posts'
import { Route as CustomScriptDotjsRouteImport } from './routes/customScript[.]js'
import { Route as PathlessLayoutRouteImport } from './routes/_pathlessLayout'
import { Route as IndexRouteImport } from './routes/index'
import { Route as UsersIndexRouteImport } from './routes/users.index'
import { Route as PostsIndexRouteImport } from './routes/posts.index'
import { Route as UsersUserIdRouteImport } from './routes/users.$userId'
import { Route as PostsPostIdRouteImport } from './routes/posts.$postId'
import { Route as PathlessLayoutNestedLayoutRouteImport } from './routes/_pathlessLayout/_nested-layout'
import { Route as PostsPostIdDeepRouteImport } from './routes/posts_.$postId.deep'
import { Route as PathlessLayoutNestedLayoutRouteBRouteImport } from './routes/_pathlessLayout/_nested-layout/route-b'
import { Route as PathlessLayoutNestedLayoutRouteARouteImport } from './routes/_pathlessLayout/_nested-layout/route-a'

const UsersRoute = UsersRouteImport.update({
  id: '/users',
  path: '/users',
  getParentRoute: () => rootRouteImport,
} as any)
const PostsRoute = PostsRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRouteImport,
} as any)
const CustomScriptDotjsRoute = CustomScriptDotjsRouteImport.update({
  id: '/customScript.js',
  path: '/customScript.js',
  getParentRoute: () => rootRouteImport,
} as any)
const PathlessLayoutRoute = PathlessLayoutRouteImport.update({
  id: '/_pathlessLayout',
  getParentRoute: () => rootRouteImport,
} as any)
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const UsersIndexRoute = UsersIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => UsersRoute,
} as any)
const PostsIndexRoute = PostsIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => PostsRoute,
} as any)
const UsersUserIdRoute = UsersUserIdRouteImport.update({
  id: '/$userId',
  path: '/$userId',
  getParentRoute: () => UsersRoute,
} as any)
const PostsPostIdRoute = PostsPostIdRouteImport.update({
  id: '/$postId',
  path: '/$postId',
  getParentRoute: () => PostsRoute,
} as any)
const PathlessLayoutNestedLayoutRoute =
  PathlessLayoutNestedLayoutRouteImport.update({
    id: '/_nested-layout',
    getParentRoute: () => PathlessLayoutRoute,
  } as any)
const PostsPostIdDeepRoute = PostsPostIdDeepRouteImport.update({
  id: '/posts_/$postId/deep',
  path: '/posts/$postId/deep',
  getParentRoute: () => rootRouteImport,
} as any)
const PathlessLayoutNestedLayoutRouteBRoute =
  PathlessLayoutNestedLayoutRouteBRouteImport.update({
    id: '/route-b',
    path: '/route-b',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  } as any)
const PathlessLayoutNestedLayoutRouteARoute =
  PathlessLayoutNestedLayoutRouteARouteImport.update({
    id: '/route-a',
    path: '/route-a',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/customScript.js': typeof CustomScriptDotjsRoute
  '/posts': typeof PostsRouteWithChildren
  '/users': typeof UsersRouteWithChildren
  '/posts/$postId': typeof PostsPostIdRoute
  '/users/$userId': typeof UsersUserIdRoute
  '/posts/': typeof PostsIndexRoute
  '/users/': typeof UsersIndexRoute
  '/route-a': typeof PathlessLayoutNestedLayoutRouteARoute
  '/route-b': typeof PathlessLayoutNestedLayoutRouteBRoute
  '/posts/$postId/deep': typeof PostsPostIdDeepRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/customScript.js': typeof CustomScriptDotjsRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/posts'
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  PostsRoute: typeof PostsRouteWithChildren
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/users': {
      id: '/users'
      path: '/users'
      fullPath: '/users'
      preLoaderRoute: typeof UsersRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/_pathlessLayout': {
      id: '/_pathlessLayout'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof PathlessLayoutRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/_pathlessLayout/_nested-layout': {
      id: '/_pathlessLayout/_nested-layout'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof PathlessLayoutNestedLayoutRouteImport
      parentRoute: typeof PathlessLayoutRoute
    }
  }
}

interface PathlessLayoutNestedLayoutRouteChildren {
  PathlessLayoutNestedLayoutRouteARoute: typeof PathlessLayoutNestedLayoutRouteARoute
  PathlessLayoutNestedLayoutRouteBRoute: typeof PathlessLayoutNestedLayoutRouteBRoute
}

const PathlessLayoutNestedLayoutRouteChildren: PathlessLayoutNestedLayoutRouteChildren =
  {
    PathlessLayoutNestedLayoutRouteARoute:
      PathlessLayoutNestedLayoutRouteARoute,
    PathlessLayoutNestedLayoutRouteBRoute:
      PathlessLayoutNestedLayoutRouteBRoute,
  }

const PathlessLayoutNestedLayoutRouteWithChildren =
  PathlessLayoutNestedLayoutRoute._addFileChildren(
    PathlessLayoutNestedLayoutRouteChildren,
  )

interface PathlessLayoutRouteChildren {
  PathlessLayoutNestedLayoutRoute: typeof PathlessLayoutNestedLayoutRouteWithChildren
}

const PathlessLayoutRouteChildren: PathlessLayoutRouteChildren = {
  PathlessLayoutNestedLayoutRoute: PathlessLayoutNestedLayoutRouteWithChildren,
}

const PathlessLayoutRouteWithChildren = PathlessLayoutRoute._addFileChildren(
  PathlessLayoutRouteChildren,
)

interface PostsRouteChildren {
  PostsPostIdRoute: typeof PostsPostIdRoute
  PostsIndexRoute: typeof PostsIndexRoute
}

const PostsRouteChildren: PostsRouteChildren = {
  PostsPostIdRoute: PostsPostIdRoute,
  PostsIndexRoute: PostsIndexRoute,
}

const PostsRouteWithChildren = PostsRoute._addFileChildren(PostsRouteChildren)

interface UsersRouteChildren {
  UsersUserIdRoute: typeof UsersUserIdRoute
  UsersIndexRoute: typeof UsersIndexRoute
}

const UsersRouteChildren: UsersRouteChildren = {
  UsersUserIdRoute: UsersUserIdRoute,
  UsersIndexRoute: UsersIndexRoute,
}

const UsersRouteWithChildren = UsersRoute._addFileChildren(UsersRouteChildren)

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  PathlessLayoutRoute: PathlessLayoutRouteWithChildren,
  PostsRoute: PostsRouteWithChildren,
  UsersRoute: UsersRouteWithChildren,
  PostsPostIdDeepRoute: PostsPostIdDeepRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/', importPath: './routes/index' },
      { routePath: '/customScript.js', importPath: './routes/customScript[.]js' },
      { routePath: '/posts', importPath: './routes/posts' },
      { routePath: '/posts/', importPath: './routes/posts.index' },
      { routePath: '/posts/$postId', importPath: './routes/posts.$postId' },
      { routePath: '/posts/$postId/deep', importPath: './routes/posts_.$postId.deep' },
      { routePath: '/route-a', importPath: './routes/_pathlessLayout/_nested-layout/route-a' },
      { routePath: '/route-b', importPath: './routes/_pathlessLayout/_nested-layout/route-b' },
      { routePath: '/users', importPath: './routes/users' },
      { routePath: '/users/', importPath: './routes/users.index' },
      { routePath: '/users/$userId', importPath: './routes/users.$userId' },
    ]);
  });

  it('should handle a complex real-world-like scenario', () => {
    const source = `
import { Route as rootRouteImport } from './routes/__root'
import { Route as WithUserRouteImport } from './routes/_with-user'
import { Route as WithoutUserRouteImport } from './routes/_without-user'
import { Route as IndexRouteImport } from './routes/index'
import { Route as WithUserAppRouteImport } from './routes/_with-user/app'
import { Route as WithoutUserGetStartedIndexRouteImport } from './routes/_without-user/get-started/index'
import { Route as ApiRpcSplatRouteImport } from './routes/api/rpc/$'
import { Route as WithUserAppOrganizationsRouteImport } from './routes/_with-user/app/organizations'
import { Route as WithUserAppWithOrgRouteImport } from './routes/_with-user/app/_with-org'
import { Route as WithUserAppWithOrgSitesSiteIdRouteImport } from './routes/_with-user/app/_with-org/sites/$siteId'

const WithUserRoute = WithUserRouteImport.update({
  id: '/_with-user',
  getParentRoute: () => rootRouteImport,
} as any)
const WithoutUserRoute = WithoutUserRouteImport.update({
  id: '/_without-user',
  getParentRoute: () => rootRouteImport,
} as any)
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const WithUserAppRoute = WithUserAppRouteImport.update({
  id: '/app',
  path: '/app',
  getParentRoute: () => WithUserRoute,
} as any)
const WithoutUserGetStartedIndexRoute = WithoutUserGetStartedIndexRouteImport.update({
  id: '/get-started/',
  path: '/get-started/',
  getParentRoute: () => WithoutUserRoute,
} as any)
const ApiRpcSplatRoute = ApiRpcSplatRouteImport.update({
  id: '/api/rpc/$',
  path: '/api/rpc/$',
  getParentRoute: () => rootRouteImport,
} as any)
const WithUserAppOrganizationsRoute = WithUserAppOrganizationsRouteImport.update({
  id: '/organizations',
  path: '/organizations',
  getParentRoute: () => WithUserAppRoute,
} as any)
const WithUserAppWithOrgRoute = WithUserAppWithOrgRouteImport.update({
  id: '/_with-org',
  getParentRoute: () => WithUserAppRoute,
} as any)
const WithUserAppWithOrgSitesSiteIdRoute = WithUserAppWithOrgSitesSiteIdRouteImport.update({
  id: '/sites/$siteId',
  path: '/sites/$siteId',
  getParentRoute: () => WithUserAppWithOrgRoute,
} as any)

const WithUserAppWithOrgSitesSiteIdRouteChildren = {
  // children here
}
const WithUserAppWithOrgSitesSiteIdRouteWithChildren = WithUserAppWithOrgSitesSiteIdRoute._addFileChildren(
  WithUserAppWithOrgSitesSiteIdRouteChildren,
)

const WithUserAppWithOrgRouteChildren = {
  WithUserAppWithOrgSitesSiteIdRoute: WithUserAppWithOrgSitesSiteIdRouteWithChildren,
}
const WithUserAppWithOrgRouteWithChildren = WithUserAppWithOrgRoute._addFileChildren(
  WithUserAppWithOrgRouteChildren,
)

const WithUserAppOrganizationsRouteChildren = {}
const WithUserAppOrganizationsRouteWithChildren = WithUserAppOrganizationsRoute._addFileChildren(
  WithUserAppOrganizationsRouteChildren,
)

const WithUserAppRouteChildren = {
  WithUserAppWithOrgRoute: WithUserAppWithOrgRouteWithChildren,
  WithUserAppOrganizationsRoute: WithUserAppOrganizationsRouteWithChildren,
}
const WithUserAppRouteWithChildren = WithUserAppRoute._addFileChildren(
  WithUserAppRouteChildren,
)

const WithUserRouteChildren = {
  WithUserAppRoute: WithUserAppRouteWithChildren,
}
const WithUserRouteWithChildren = WithUserRoute._addFileChildren(
  WithUserRouteChildren,
)

const WithoutUserRouteChildren = {
  WithoutUserGetStartedIndexRoute: WithoutUserGetStartedIndexRoute,
}
const WithoutUserRouteWithChildren = WithoutUserRoute._addFileChildren(
  WithoutUserRouteChildren,
)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/api/rpc/$': typeof ApiRpcSplatRoute
  '/get-started/': typeof WithoutUserGetStartedIndexRoute
  '/app': typeof WithUserAppWithOrgRouteWithChildren
  '/app/organizations': typeof WithUserAppOrganizationsRouteWithChildren
  '/app/sites/$siteId': typeof WithUserAppWithOrgSitesSiteIdRouteWithChildren
}
`;
    const result = parseRouteTree(source);
    assert.deepStrictEqual(result, [
      { routePath: '/', importPath: './routes/index' },
      { routePath: '/api/rpc/$', importPath: './routes/api/rpc/$' },
      { routePath: '/app', importPath: './routes/_with-user/app/_with-org' },
      { routePath: '/app/organizations', importPath: './routes/_with-user/app/organizations' },
      { routePath: '/app/sites/$siteId', importPath: './routes/_with-user/app/_with-org/sites/$siteId' },
      { routePath: '/get-started/', importPath: './routes/_without-user/get-started/index' },
    ]);
  });
});
