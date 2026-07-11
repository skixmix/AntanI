const vscode = require("vscode");
const net = require("net");
const fs = require("fs");
const path = require("path");

// Mirrored byte-for-byte in `src-tauri/src/vscode_server.rs::fnv1a`.
function fnv1a(str) {
  const bytes = Buffer.from(str, "utf8");
  let hash = 0x811c9dc5;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function activate(context) {
  const socketDir = process.env.ANTANI_BRIDGE_SOCKET_DIR;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!socketDir || !folder) {
    return;
  }

  const socketPath = path.join(socketDir, `${fnv1a(folder)}.sock`);
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // No stale socket to remove.
  }

  const server = net.createServer((conn) => {
    let payload = "";
    conn.on("data", (chunk) => {
      payload += chunk;
    });
    conn.on("end", async () => {
      const file = payload.trim();
      if (!file) {
        return;
      }
      try {
        await vscode.commands.executeCommand("workbench.view.scm");
        await vscode.commands.executeCommand("git.openChange", vscode.Uri.file(file));
      } catch (err) {
        console.error("antani-diff-bridge:", err);
      }
    });
  });

  server.on("error", (err) => {
    console.error("antani-diff-bridge: socket listen failed:", err);
  });
  server.listen(socketPath);
  context.subscriptions.push({ dispose: () => server.close() });
}

function deactivate() {}

module.exports = { activate, deactivate };
