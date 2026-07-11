import { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { killPty, onPtyExit, resizePty, spawnPty, writePty } from "../lib/api";
import { PTY_RESIZE_DEBOUNCE_MS, TERMINAL_SCROLLBACK } from "../lib/constants";
import type { TabStatus } from "../lib/tabs";

const WAITING_RE =
  /(\[y\/n\]|\(y\/n\)|\(Y\/n\)|\(N\/y\)|yes\/no|Do you want|Allow once|Allow always|Permission required|Trust|Proceed\?|Continue\?|confirm|Press enter|press any key|Esc to cancel)/i;

// Long enough that a mid-response pause (waiting on a tool call, network
// latency between streamed chunks, ...) doesn't get misread as "done" —
// each such false "ready" flips the tab-chip spinner to the green dot and
// back, restarting its CSS animation and making it look like it never
// settles into a smooth spin.
const SILENCE_MS = 3000;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;

interface TerminalViewProps {
  tabId: string;
  cwd: string;
  startupCommand: string | null;
  visible: boolean;
  isAi?: boolean;
  onStatusChange?: (tabId: string, status: TabStatus) => void;
}

export function TerminalView({
  tabId,
  cwd,
  startupCommand,
  visible,
  isAi,
  onStatusChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const fontSizeRef = useRef(DEFAULT_FONT_SIZE);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      scrollback: TERMINAL_SCROLLBACK,
      cursorBlink: true,
      theme: { background: "#252830" },
      lineHeight: 1,
      fontFamily: "Menlo, monospace",
      fontSize: fontSizeRef.current,
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
    let lastUserInputAt = 0;
    // Armed for the tab's initial boot (spawning the CLI counts as "busy"
    // until its startup settles), then cleared. From there on, only a real
    // keystroke re-arms it — otherwise incidental output (a background
    // clock/spinner the CLI redraws on its own) would flip a tab to "busy"
    // the user never touched. Also cleared whenever a turn genuinely
    // resolves to "ready", so idle-time redraws after that don't re-arm it.
    let armed = true;
    const ECHO_SUPPRESS_MS = 400;

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
        const status: TabStatus = WAITING_RE.test(visibleScreenText()) ? "waiting" : "ready";
        onStatusChange?.(tabId, status);
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
      if (disposed || !isAi || !onStatusChange || !armed) return;
      // Echo suppression only skips the *busy* flip (to avoid a flash from the
      // user's own keystrokes); the ready-check timer must still (re)schedule
      // here, otherwise output that lands inside the suppress window can leave
      // the tab stuck on "busy" with no timer left to resolve it.
      const now = performance.now();
      if (now - lastUserInputAt >= ECHO_SUPPRESS_MS) {
        seenBusy = true;
        onStatusChange(tabId, "busy");
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
      if (disposed || !isAi || !onStatusChange || !armed) return;
      if (WAITING_RE.test(visibleScreenText())) {
        seenBusy = true;
        window.clearTimeout(silenceTimer);
        onStatusChange(tabId, "waiting");
      }
    }

    const output = new Channel<ArrayBuffer>();
    output.onmessage = (bytes) => {
      if (disposed) return;
      term.write(new Uint8Array(bytes), onWriteFlushed);
      onOutputArrived();
    };
    term.onData((data) => {
      lastUserInputAt = performance.now();
      void writePty(tabId, data);
    });
    // onData also fires for mouse-tracking escape sequences (a click to
    // focus the terminal is enough, if the CLI has mouse reporting on) and
    // programmatic writes/paste — none of which are the user "interacting
    // with the AI". onKey only fires for real keyboard events, so arming is
    // gated on that instead.
    term.onKey(() => {
      armed = true;
    });
    // xterm.js sends the same "\r" for Enter and Shift+Enter, so CLIs that
    // distinguish them (e.g. Claude Code, which uses Shift+Enter to insert a
    // newline instead of submitting) never see the difference. AI CLI tabs
    // opt into the CSI u extended-key sequence for Shift+Enter, the same way
    // iTerm2/Kitty report it. Plain shells don't parse CSI u (it would just
    // echo back as text), so instead we send Ctrl-V + Ctrl-J there: readline's
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
        lastUserInputAt = performance.now();
        armed = true;
        void writePty(tabId, isAi ? "\x1b[13;2u" : "\x16\n");
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
        onStatusChange?.(tabId, "idle");
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
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
      try {
        term.dispose();
      } catch {
        /* ignore dispose errors */
      }
      void spawned.finally(() => killPty(tabId));
    };
  }, [tabId, cwd, startupCommand, isAi, onStatusChange]);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    term.focus();
    void resizePty(tabId, term.cols, term.rows);
  }, [visible, tabId]);

  function zoom(delta: number) {
    setFontSize((s) => {
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, s + delta));
      fontSizeRef.current = next;
      const term = termRef.current;
      const fit = fitRef.current;
      if (term && fit) {
        term.options.fontSize = next;
        fit.fit();
        void resizePty(tabId, term.cols, term.rows);
      }
      return next;
    });
  }

  return (
    <div className="absolute inset-0" style={{ display: visible ? "block" : "none" }}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden p-1.5" />
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded bg-black/40 px-2 py-1 text-[11px] text-white/60">
        <button type="button" className="hover:text-white" onClick={() => zoom(-1)}>
          −
        </button>
        <span className="tabular-nums w-8 text-center text-white/80">{fontSize}px</span>
        <button type="button" className="hover:text-white" onClick={() => zoom(1)}>
          +
        </button>
      </div>
    </div>
  );
}
