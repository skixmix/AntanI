# antani-diff-bridge

Internal VS Code extension, bundled into the app and auto-installed into
code-server on every launch (see `vscode_server.rs::install_bridge_extension`).
Listens on a Unix socket (path from `$ANTANI_BRIDGE_SOCKET`) for a file path and
opens VS Code's native diff view for it via `git.openChange`.

`antani-diff-bridge.vsix` is a committed, prebuilt binary — there is no build step
in the app's normal dev/build flow. If you change `extension.js` or `package.json`,
rebuild it and commit the result:

```sh
bunx --bun @vscode/vsce package --no-dependencies -o antani-diff-bridge.vsix
```
