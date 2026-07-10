import { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { killPty, onPtyExit, resizePty, spawnPty, writePty } from "../lib/api";
import { PTY_RESIZE_DEBOUNCE_MS, TERMINAL_SCROLLBACK } from "../lib/constants";
import type { TabStatus } from "../lib/tabs";

const WAITING_RE =
  /(\[y\/n\]|\(y\/n\)|\(Y\/n\)|\(N\/y\)|yes\/no|Do you want|Allow|Trust|Proceed\?|Continue\?|confirm|Press enter|press any key)/i;

function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI strip
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

const SILENCE_MS = 1200;
const TAIL_LEN = 800;
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
    try { term.loadAddon(new CanvasAddon()); } catch { /* fallback to default renderer */ }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;

    let silenceTimer: number | undefined;
    let tail = "";
    let seenBusy = false;
    let lastUserInputAt = 0;
    const ECHO_SUPPRESS_MS = 400;
    const decoder = new TextDecoder();

    function scheduleReadyCheck() {
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => {
        if (disposed || !seenBusy) return;
        const plain = stripAnsi(tail);
        const status: TabStatus = WAITING_RE.test(plain) ? "waiting" : "ready";
        onStatusChange?.(tabId, status);
      }, SILENCE_MS);
    }

    const output = new Channel<ArrayBuffer>();
    output.onmessage = (bytes) => {
      if (disposed) return;
      term.write(new Uint8Array(bytes));
      if (isAi && onStatusChange) {
        const now = performance.now();
        if (now - lastUserInputAt < ECHO_SUPPRESS_MS) return;
        const chunk = decoder.decode(bytes, { stream: true });
        tail = (tail + chunk).slice(-TAIL_LEN);
        seenBusy = true;
        onStatusChange(tabId, "busy");
        scheduleReadyCheck();
      }
    };
    term.onData((data) => {
      lastUserInputAt = performance.now();
      void writePty(tabId, data);
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
      try { term.dispose(); } catch { /* ignore dispose errors */ }
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
        <button
          type="button"
          className="hover:text-white"
          onClick={() => zoom(-1)}
        >
          −
        </button>
        <span className="tabular-nums w-8 text-center text-white/80">{fontSize}px</span>
        <button
          type="button"
          className="hover:text-white"
          onClick={() => zoom(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
