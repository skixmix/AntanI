import { useEffect, useState } from "react";
import { getVscodeMemoryMb } from "../lib/api";
import { VSCodeIcon } from "./Icons";

const POLL_INTERVAL_MS = 3000;

export function StatusBar() {
  const [memMb, setMemMb] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const mb = await getVscodeMemoryMb();
        if (!cancelled) setMemMb(mb);
      } catch {
        if (!cancelled) setMemMb(null);
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground"
      style={{ height: 22 }}
    >
      <span className="flex items-center gap-1.5">
        <VSCodeIcon size={11} className="text-[#007ACC]" />
        {memMb !== null ? (
          <span>
            <span className="text-foreground/70">{memMb}</span>
            <span> MB</span>
          </span>
        ) : (
          <span>off</span>
        )}
      </span>
    </div>
  );
}
