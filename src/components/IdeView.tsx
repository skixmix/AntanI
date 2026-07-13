import { useEffect, useRef, useState } from "react";
import {
  closeIdeWebview,
  createIdeWebview,
  ensureIdeServer,
  hideIdeWebview,
  type IdeBounds,
  onIdeServerStatus,
  setIdeBounds,
  showIdeWebview,
  titleBarOffset,
} from "../lib/api.ipc";

interface IdeViewProps {
  projectId: string;
  folder: string;
  visible: boolean;
}

type Phase = "loading" | "ready" | "error";

const SAME_BOUNDS_EPSILON = 1;

function readBounds(el: HTMLElement, offsetY: number): IdeBounds | null {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return {
    x: Math.round(r.left),
    y: Math.round(r.top) + offsetY,
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function sameBounds(a: IdeBounds | null, b: IdeBounds): boolean {
  if (!a) return false;
  return (
    Math.abs(a.x - b.x) < SAME_BOUNDS_EPSILON &&
    Math.abs(a.y - b.y) < SAME_BOUNDS_EPSILON &&
    Math.abs(a.width - b.width) < SAME_BOUNDS_EPSILON &&
    Math.abs(a.height - b.height) < SAME_BOUNDS_EPSILON
  );
}

/**
 * A React-owned placeholder whose measured rectangle drives a native child
 * webview (created in Rust) laid over it. React never renders the editor itself —
 * it only reports geometry and toggles show/hide — so the webview, and thus the
 * editor's unsaved buffers, persist across tab and project switches even while
 * this component's DOM is hidden.
 */
export function IdeView({ projectId, folder, visible }: IdeViewProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const startRef = useRef<() => void>(() => {});

  const disposedRef = useRef(false);
  const createdRef = useRef(false);
  const wantCreateRef = useRef(false);
  const lastBoundsRef = useRef<IdeBounds | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    disposedRef.current = false;
    createdRef.current = false;
    wantCreateRef.current = false;
    lastBoundsRef.current = null;

    async function create() {
      const el = placeholderRef.current;
      if (disposedRef.current || createdRef.current || !el) return;
      const b = readBounds(el, offsetRef.current);
      if (!b) return;
      try {
        await createIdeWebview(projectId, folder, b);
        if (disposedRef.current) {
          void closeIdeWebview(projectId);
          return;
        }
        createdRef.current = true;
        setPhase("ready");
      } catch (e) {
        if (!disposedRef.current) {
          setMessage(String(e));
          setPhase("error");
        }
      }
    }

    async function start() {
      setPhase("loading");
      setMessage(null);
      wantCreateRef.current = true;
      offsetRef.current = await titleBarOffset();
      if (disposedRef.current) return;
      try {
        const status = await ensureIdeServer();
        if (disposedRef.current) return;
        if (status === "ready") await create();
        else if (status === "failed") setPhase("error");
      } catch (e) {
        if (!disposedRef.current) {
          setMessage(String(e));
          setPhase("error");
        }
      }
    }
    startRef.current = start;

    let unlisten: (() => void) | undefined;
    void onIdeServerStatus((event) => {
      if (disposedRef.current) return;
      if (event.status === "ready" && wantCreateRef.current && !createdRef.current) {
        void create();
      } else if (event.status === "failed") {
        createdRef.current = false;
        setMessage(event.message);
        setPhase("error");
      }
    }).then((fn) => {
      if (disposedRef.current) fn();
      else unlisten = fn;
    });

    void start();

    return () => {
      disposedRef.current = true;
      unlisten?.();
      void closeIdeWebview(projectId);
    };
  }, [projectId, folder]);

  useEffect(() => {
    const el = placeholderRef.current;
    if (!el || phase !== "ready") return;

    if (!visible) {
      void hideIdeWebview(projectId);
      return;
    }

    let frame = 0;
    const push = () => {
      const b = readBounds(el, offsetRef.current);
      if (!b || sameBounds(lastBoundsRef.current, b)) return;
      lastBoundsRef.current = b;
      void setIdeBounds(projectId, b);
    };
    const b = readBounds(el, offsetRef.current);
    if (b) {
      lastBoundsRef.current = b;
      void showIdeWebview(projectId, b);
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(push);
    });
    observer.observe(el);
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(push);
    };
    window.addEventListener("resize", onResize);

    // Temporarily park the webview while any color picker is open so it doesn't
    // paint over the picker (native webviews are always above web content).
    const onPickerOpen = () => void hideIdeWebview(projectId);
    const onPickerClose = () => {
      const bounds = readBounds(el, offsetRef.current);
      if (bounds) void showIdeWebview(projectId, bounds);
    };
    window.addEventListener("antani:picker-open", onPickerOpen);
    window.addEventListener("antani:picker-close", onPickerClose);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("antani:picker-open", onPickerOpen);
      window.removeEventListener("antani:picker-close", onPickerClose);
    };
  }, [visible, phase, projectId]);

  function reload() {
    createdRef.current = false;
    lastBoundsRef.current = null;
    void closeIdeWebview(projectId).finally(() => {
      if (!disposedRef.current) startRef.current();
    });
  }

  return (
    <div
      ref={placeholderRef}
      className="absolute inset-0 overflow-hidden bg-background"
      style={{ display: visible ? "block" : "none" }}
    >
      {phase !== "ready" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground no-select">
          {phase === "loading" ? (
            <>
              <svg
                aria-label="Loading"
                className="animate-spin text-muted-foreground/60"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <p className="text-sm">Starting the VS Code server…</p>
            </>
          ) : (
            <>
              <p className="max-w-sm text-sm text-destructive">
                {message ?? "The VS Code server is not available."}
              </p>
              <button
                type="button"
                onClick={reload}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
              >
                Reload
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
