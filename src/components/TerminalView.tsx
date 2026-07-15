import { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { settledAgentStatus } from "../lib/agentStatus";
import { killPty, onPtyExit, onPtyRunning, resizePty, spawnPty, writePty } from "../lib/api.ipc";
import { PTY_RESIZE_DEBOUNCE_MS, TERMINAL_SCROLLBACK } from "../lib/constants";
import { fileDrag } from "../lib/fileDrag";
import { softNewlineForKind } from "../lib/inject";
import type { AgentKind, TabStatus } from "../lib/tabs";

// Long enough that a mid-response pause (waiting on a tool call, network
// latency between streamed chunks, ...) doesn't get misread as "done" —
// each such false "ready" flips the tab-chip spinner to the green dot and
// back, restarting its CSS animation and making it look like it never
// settles into a smooth spin.
const SILENCE_MS = 3500;

// Same convention as Terminal.app/iTerm2: wrap each dropped path in single
// quotes so spaces and other shell-special characters survive as literal
// text instead of being reinterpreted by the shell.
function shellEscapePath(path: string): string {
  return `'${path.split("'").join("'\\''")}'`;
}

interface TerminalViewProps {
  tabId: string;
  cwd: string;
  startupCommand: string | null;
  visible: boolean;
  fontSize: number;
  agentKind?: AgentKind;
  onStatusChange?: (tabId: string, status: TabStatus) => void;
  /** Foreground-process-group signal, independent of the AI busy/ready/waiting
   *  pipeline above: fires for any tab kind, driven by the pty itself rather
   *  than output heuristics. */
  onRunningChange?: (tabId: string, running: boolean) => void;
}

export function TerminalView({
  tabId,
  cwd,
  startupCommand,
  visible,
  fontSize,
  agentKind,
  onStatusChange,
  onRunningChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // fontSize is only read here as the initial size; live changes are applied
  // by the dedicated fontSize effect below without respawning the PTY.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      scrollback: TERMINAL_SCROLLBACK,
      cursorBlink: true,
      theme: { background: "#252830" },
      lineHeight: 1,
      fontFamily: "Menlo, monospace",
      fontSize,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      term.loadAddon(new CanvasAddon());
    } catch {
      /* fallback to default renderer */
    }
    // Cmd+click only, matching iTerm2/VS Code, so a plain click can still
    // select link text instead of always navigating away.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (!event.metaKey) return;
        void openUrl(uri);
      }),
    );
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;

    let silenceTimer: number | undefined;
    let seenBusy = false;
    // True from the first keystroke of an unsent message until it's actually
    // submitted (Enter, not Shift+Enter). While true, PTY output must not
    // drive any status transition: the terminal's own echo of the draft is
    // on screen the whole time the user is composing, no matter how long
    // they pause, so a timing-based suppression window can't fully hide it —
    // only "has this actually been sent yet" can.
    let composing = false;
    // Single gate for every status write below: onOutputArrived and
    // onWriteFlushed both react to the same PTY chunk, and without a shared
    // "what did we last actually send" check they can race each other (one
    // sets busy, the other immediately re-asserts waiting) and re-fire the
    // same status repeatedly, which App.tsx's notify-dedup reads as distinct
    // new prompts.
    let lastStatus: TabStatus = "idle";
    function setStatus(next: TabStatus) {
      if (next === lastStatus) return;
      lastStatus = next;
      onStatusChange?.(tabId, next);
    }
    // Armed for the tab's initial boot (spawning the CLI counts as "busy"
    // until its startup settles), then cleared. From there on, only a real
    // keystroke re-arms it — otherwise incidental output (a background
    // clock/spinner the CLI redraws on its own) would flip a tab to "busy"
    // the user never touched. Also cleared whenever a turn genuinely
    // resolves to "ready", so idle-time redraws after that don't re-arm it.
    let armed = true;

    // The actual rendered screen, not a rolling window of raw output bytes:
    // TUIs that redraw via cursor-addressed partial updates (Ink, blessed,
    // opencode's UI, ...) can leave a prompt sitting on screen indefinitely
    // without ever re-emitting its text, so a raw-byte tail eventually loses
    // it — even though it's still visible — as soon as enough unrelated
    // redraw traffic (an animated spinner elsewhere, say) scrolls it out of
    // the window. Reading xterm's own buffer sidesteps that entirely: it's
    // always exactly what's on screen right now.
    function visibleScreenText(): string {
      const buf = term.buffer.active;
      const lines: string[] = [];
      for (let y = 0; y < term.rows; y++) {
        const line = buf.getLine(buf.viewportY + y);
        if (line) lines.push(line.translateToString(true));
      }
      return lines.join("\n");
    }

    function scheduleReadyCheck() {
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => {
        if (disposed || !seenBusy) return;
        // An unsent draft (e.g. the user paused mid-message) sits on screen
        // the whole time composing is true — checking it here would read the
        // user's own typed text as a permission prompt. Bail and let the
        // eventual submit (which triggers real output) re-drive this timer.
        if (composing) return;
        if (!agentKind) return;
        const status = settledAgentStatus(agentKind, visibleScreenText());
        setStatus(status);
        if (status === "ready") {
          armed = false;
          seenBusy = false;
        }
      }, SILENCE_MS);
    }

    // Fires as soon as bytes arrive over IPC — independent of xterm's own
    // render/parse loop, which can lag or batch for a hidden (display:none)
    // background tab. Driving the silence timer from here, rather than from
    // term.write()'s completion callback, keeps the busy/ready cadence
    // accurate no matter which tab is currently visible.
    function onOutputArrived() {
      if (disposed || !agentKind || !onStatusChange || !armed) return;
      // While composing, the ready-check timer must still (re)schedule here,
      // otherwise output that lands mid-draft can leave the tab stuck on
      // "busy" with no timer left to resolve it once the draft is sent.
      // A still-visible waiting prompt must not be bumped to "busy" just
      // because unrelated output arrived (e.g. a background spinner
      // redrawing) — only onWriteFlushed, which actually re-checks the
      // screen, is allowed to move the tab off "waiting".
      if (!composing && lastStatus !== "waiting") {
        seenBusy = true;
        setStatus("busy");
      }
      scheduleReadyCheck();
    }

    // Checked on every write, not just after a silence window: a TUI that
    // keeps animating an unrelated spinner (e.g. a background task) never
    // goes quiet, so a silence-only check would never notice a permission
    // prompt sitting on screen underneath it. This needs the buffer actually
    // updated, so it runs from term.write()'s completion callback rather
    // than immediately — a bit of lag here (vs. onOutputArrived above) only
    // delays waiting-prompt detection slightly, it doesn't cause flicker.
    function onWriteFlushed() {
      if (disposed || !agentKind || !onStatusChange || !armed || composing) return;
      // This is the path that scans the *whole* visible screen, so without
      // the composing check above, the terminal's own echo of the user's
      // still-being-typed message (e.g. containing "confirm" or "continue?")
      // can trip prompt detection before anything was ever sent.
      if (settledAgentStatus(agentKind, visibleScreenText()) === "waiting") {
        seenBusy = true;
        window.clearTimeout(silenceTimer);
        setStatus("waiting");
      } else if (lastStatus === "waiting") {
        // The prompt text has left the screen — fall back to busy so the
        // silence timer (already scheduled by onOutputArrived) can resolve
        // it to "ready" normally instead of staying stuck on "waiting".
        setStatus("busy");
      }
    }

    const output = new Channel<ArrayBuffer>();
    output.onmessage = (bytes) => {
      if (disposed) return;
      term.write(new Uint8Array(bytes), onWriteFlushed);
      onOutputArrived();
    };
    term.onData((data) => {
      void writePty(tabId, data);
    });
    // onData also fires for mouse-tracking escape sequences (a click to
    // focus the terminal is enough, if the CLI has mouse reporting on) and
    // programmatic writes/paste — none of which are the user "interacting
    // with the AI". onKey only fires for real keyboard events, so arming
    // (and composing) is gated on that instead.
    term.onKey(({ domEvent }) => {
      armed = true;
      // Enter (not Shift+Enter, which inserts a newline rather than
      // submitting) is the one keystroke that ends a draft.
      composing = !(domEvent.key === "Enter" && !domEvent.shiftKey);
    });
    // xterm.js sends the same "\r" for Enter and Shift+Enter, so the PTY never
    // sees the modifier unless we encode it ourselves. Agent composers use
    // Ctrl-J, and plain shells use Ctrl-V + Ctrl-J: readline's
    // default "quoted-insert" binding in bash/zsh inserts the following key
    // literally, turning a would-be Enter into a real newline in the line
    // buffer instead of submitting it. It must be Ctrl-J (line feed), not
    // Ctrl-M (carriage return) — a literal \r isn't treated as a line break,
    // it just renders as the "^M" control-character notation.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && event.key === "Enter" && event.shiftKey) {
        // Returning false only tells xterm to skip its own handling — it
        // won't call preventDefault() for us, so without this the browser's
        // default "insert newline in the hidden textarea" action still
        // fires and leaks through xterm's input-sync path as an extra key.
        event.preventDefault();
        armed = true;
        composing = true;
        void writePty(tabId, softNewlineForKind(agentKind ?? "terminal"));
        return false;
      }
      return true;
    });

    let resizeTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      if (disposed || container.clientWidth === 0) return;
      fit.fit();
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(
        () => void resizePty(tabId, term.cols, term.rows),
        PTY_RESIZE_DEBOUNCE_MS,
      );
    });
    observer.observe(container);

    let unlisten: UnlistenFn | undefined;
    void onPtyExit((event) => {
      if (!disposed && event.tabId === tabId) {
        term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
        window.clearTimeout(silenceTimer);
        seenBusy = false;
        armed = false;
        setStatus("idle");
        onRunningChange?.(tabId, false);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    let unlistenRunning: UnlistenFn | undefined;
    void onPtyRunning((event) => {
      if (!disposed && event.tabId === tabId) onRunningChange?.(tabId, event.running);
    }).then((fn) => {
      if (disposed) fn();
      else unlistenRunning = fn;
    });

    const spawned = spawnPty(
      { tabId, cwd, cols: term.cols, rows: term.rows, startupCommand },
      output,
    );
    spawned.catch((e) => {
      if (!disposed) term.write(`\r\n\x1b[31mfailed to start shell: ${e}\x1b[0m\r\n`);
    });

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(resizeTimer);
      window.clearTimeout(silenceTimer);
      unlisten?.();
      unlistenRunning?.();
      onRunningChange?.(tabId, false);
      try {
        term.dispose();
      } catch {
        /* ignore dispose errors */
      }
      void spawned.finally(() => killPty(tabId));
    };
  }, [tabId, cwd, startupCommand, agentKind, onStatusChange, onRunningChange]);

  // Kept separate from the spawn effect above: fontSize changing must not
  // respawn the PTY, since the old effect's cleanup kills it asynchronously
  // (spawned.finally(() => killPty(tabId))) and can race past a fresh spawn
  // of the same tabId, killing the new process instead of the old one.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontSize = fontSize;
    fit.fit();
    void resizePty(tabId, term.cols, term.rows);
  }, [tabId, fontSize]);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    term.focus();
    void resizePty(tabId, term.cols, term.rows);
  }, [visible, tabId]);

  // Refocus after the injection bar writes a snippet into this tab's PTY, so
  // the user can immediately edit or submit the freshly-injected draft.
  useEffect(() => {
    if (!visible) return;
    function onFocusRequest(e: Event) {
      if ((e as CustomEvent<string>).detail !== tabId) return;
      termRef.current?.focus();
    }
    window.addEventListener("antani:focus-terminal", onFocusRequest);
    return () => window.removeEventListener("antani:focus-terminal", onFocusRequest);
  }, [visible, tabId]);

  useEffect(() => {
    if (!visible) return;
    // The webview's native drag-drop handler is window-scoped, not
    // element-scoped, so this gates on `visible` (only the active tab
    // registers a handler) rather than hit-testing the drop position.
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      if (event.payload.paths.length === 0) return;
      const text = event.payload.paths.map(shellEscapePath).join(" ");
      void writePty(tabId, `${text} `);
    });

    // In-app file drags from the source control sidebar use pointer events
    // (HTML5 drag API is unreliable in Tauri/WKWebView). On pointerup, if
    // the cursor is over this terminal's container and a file drag is in
    // flight, write the path.
    const container = containerRef.current;
    function onPointerUp(e: PointerEvent) {
      if (!fileDrag.path) return;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right) return;
      if (e.clientY < rect.top || e.clientY > rect.bottom) return;
      void writePty(tabId, `${shellEscapePath(fileDrag.path)} `);
    }
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      void unlisten.then((fn) => fn());
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [visible, tabId]);

  return (
    <div className="absolute inset-0" style={{ display: visible ? "block" : "none" }}>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden pb-3 pl-2"
        style={{ backgroundColor: "#252830" }}
      />
    </div>
  );
}
