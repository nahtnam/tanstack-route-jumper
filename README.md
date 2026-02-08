# TanStack Code

An unofficial VS Code extension for [TanStack Router](https://tanstack.com/router) and [TanStack Start](https://tanstack.com/start) projects. Quickly jump to any route's source file from a searchable list.

## Features

**Route Opener** -- Parses your auto-generated `routeTree.gen.ts` and presents every route in a searchable QuickPick. Select a route and jump straight to its source file.

- Resolves all route types: static, dynamic (`$userId`), splat (`$`), pathless layouts (`_with-auth`), and nested layouts
- Sorted alphabetically so related routes stay grouped together
- Searches both the route path and the file path

### Usage

Open the command palette and run **TanStack: Open Route**, or use the keyboard shortcut:

| Platform        | Shortcut             |
| --------------- | -------------------- |
| macOS           | `Cmd + Shift + R`    |
| Windows / Linux | `Ctrl + Shift + R`   |

## Requirements

Your project must use TanStack Router or TanStack Start with file-based routing enabled. The extension looks for a `routeTree.gen.ts` file in your workspace.

## Installation

Search for **TanStack Code** in the VS Code Extensions sidebar, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/nahtnam/tanstack-code).

## License

[MIT](LICENSE)
