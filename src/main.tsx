import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: its dev-only double-invoke of effects would spawn and then
// immediately tear down each terminal PTY (and later each embedded webview).
// Those are real OS resources, not idempotent state, so we opt out of it.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
