async function handleBridgeRequest(vscode, request) {
  switch (request.type) {
    case "openDiff":
      await vscode.commands.executeCommand("workbench.view.scm");
      await vscode.commands.executeCommand("git.refresh");
      await vscode.commands.executeCommand("git.openChange", vscode.Uri.file(request.filePath));
      return;
    case "openFile": {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(request.filePath));
      const position = new vscode.Position(request.line - 1, request.column - 1);
      await vscode.window.showTextDocument(document, {
        preview: false,
        selection: new vscode.Range(position, position),
      });
      return;
    }
  }
}

function parseBridgeRequest(payload) {
  const request = JSON.parse(payload);
  if (!request || typeof request !== "object" || typeof request.filePath !== "string") {
    throw new TypeError("Invalid AntanI IDE bridge request");
  }
  switch (request.type) {
    case "openDiff":
      return request;
    case "openFile":
      if (
        !Number.isSafeInteger(request.line) ||
        request.line < 1 ||
        !Number.isSafeInteger(request.column) ||
        request.column < 1
      ) {
        throw new TypeError("Invalid AntanI file location");
      }
      return request;
    default:
      throw new TypeError("Unknown AntanI IDE bridge request");
  }
}

module.exports = { handleBridgeRequest, parseBridgeRequest };
