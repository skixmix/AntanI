import { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { killPty, onPtyExit, resizePty, spawnPty, writePty } from "../lib/api";
import { PTY_RESIZE_DEBOUNCE_MS, TERMINAL_SCROLLBACK } from "../lib/constants";

interface TerminalViewProps {
  tabId: string;
  cwd: string;
  startupCommand: string | null;
  visible: boolean;
}

export function TerminalView({ tabId, cwd, startupCommand, visible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      scrollback: TERMINAL_SCROLLBACK,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    const output = new Channel<ArrayBuffer>();
    output.onmessage = (bytes) => {
      if (!disposed) term.write(new Uint8Array(bytes));
    };
    term.onData((data) => void writePty(tabId, data));

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
      unlisten?.();
      term.dispose();
      // Kill only after spawn settles, so the PTY is always in the backend map
      // when we ask to remove it (avoids a StrictMode double-mount orphan).
      void spawned.finally(() => killPty(tabId));
    };
  }, [tabId, cwd, startupCommand]);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    term.focus();
    void resizePty(tabId, term.cols, term.rows);
  }, [visible, tabId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden p-1.5"
      style={{ display: visible ? "block" : "none" }}
    />
  );
}
