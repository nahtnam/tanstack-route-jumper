# TanStack Route Jumper

Quickly jump to any route's source file in [TanStack Router](https://tanstack.com/router) / [TanStack Start](https://tanstack.com/start) projects.

Parses your auto-generated `routeTree.gen.ts` and presents every route in a searchable QuickPick. Select a route and jump straight to its source file.

- Resolves all route types: static, dynamic (`$userId`), splat (`$`), pathless layouts (`_with-auth`), and nested layouts
- Sorted alphabetically so related routes stay grouped together
- Searches both the route path and the file path

## Usage

Open the command palette and run **TanStack Route Jumper: Open**, or use the keyboard shortcut:

| Platform        | Shortcut             |
| --------------- | -------------------- |
| macOS           | `Cmd + Shift + R`    |
| Windows / Linux | `Ctrl + Shift + R`   |

## Requirements

Your project must use TanStack Router or TanStack Start with file-based routing enabled. The extension looks for a `routeTree.gen.ts` file in your workspace.

## Installation

Search for **TanStack Route Jumper** in the VS Code Extensions sidebar, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/nahtnam/tanstack-route-jumper).

## License

[MIT](LICENSE)
