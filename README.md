# TanStack Route Jumper

Quickly jump to any route's source file in [TanStack Router](https://tanstack.com/router) / [TanStack Start](https://tanstack.com/start) projects.

![Demo](https://raw.githubusercontent.com/nahtnam/tanstack-route-jumper/main/.github/demo.gif)

Parses your auto-generated `routeTree.gen.ts` or `routeTree.gen.js` and presents every route in a searchable QuickPick. Select a route and jump straight to its source file.

- Resolves all route types: static, dynamic (`$userId`), splat (`$`), pathless layouts (`_with-auth`), and nested layouts
- Sorted alphabetically so related routes stay grouped together
- Searches both the route path and the file path

## Usage

Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux) and run **TanStack Route Jumper: Open**. The extension activates when a workspace contains a generated `routeTree.gen.ts` or `routeTree.gen.js` file.

In a multi-root workspace, choose the folder containing the generated route tree when prompted. In a monorepo with multiple generated trees in that folder, choose the tree to use; that selection determines which route source files are shown.

## Requirements

Your project must use TanStack Router or TanStack Start with file-based routing enabled. The extension looks for a generated `routeTree.gen.ts` or `routeTree.gen.js` file in the selected workspace folder.

## Installation

Search for **TanStack Route Jumper** in the VS Code Extensions sidebar, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/nahtnam/tanstack-route-jumper).

## License

[MIT](LICENSE)
