# Changelog

All notable changes to TanStack Route Jumper will be documented in this file.

## [Unreleased]

### Changed

- Added generated TypeScript and JavaScript route-tree discovery, `addExtensions` source resolution, and explicit multi-root/monorepo selection.
- Moved parsing into a size-, time-, complexity-, and cancellation-bounded worker with safe user-facing failures.
- Declared workspace-only execution with explicit trust and virtual-workspace requirements while preserving Remote SSH support.
- Removed the conflicting default keyboard shortcut; the command is available from the Command Palette.
- Added pinned CI and repeatable VSIX content validation; only runtime code and required parser dependencies ship.

## [0.0.1] - 2026-02-07

### Added

- `TanStack Route Jumper: Open` command to jump to any route's source file
- Keyboard shortcut: `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` (Windows/Linux)
- Automatic activation when workspace contains `routeTree.gen.ts`
- Support for all route types: static, dynamic params, splat, pathless layouts, nested layouts
