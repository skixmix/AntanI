import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type React from "react";
import { useEffect, useRef } from "react";

marked.use({ gfm: true, breaks: false });

interface MarkdownProps {
  source: string;
  className?: string;
  /** When provided, task-list checkboxes render enabled and clicking one calls
   *  this with the item's document-order index (matches `parseChecklist`). */
  onToggleCheckbox?: (index: number) => void;
}

export function Markdown({ source, className, onToggleCheckbox }: MarkdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const interactive = onToggleCheckbox != null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = marked.parse(source, { async: false });
    const clean = DOMPurify.sanitize(html);
    el.innerHTML = interactive ? clean.replace(/ disabled=""/g, "") : clean;
  }, [source, interactive]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const link = target.closest("a");
    if (link) {
      const href = link.getAttribute("href");
      if (href) {
        e.preventDefault();
        void openUrl(href);
      }
      return;
    }
    if (!onToggleCheckbox || !ref.current) return;
    const box = target.closest<HTMLInputElement>('input[type="checkbox"]');
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    const boxes = Array.from(
      ref.current.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    const index = boxes.indexOf(box);
    if (index !== -1) onToggleCheckbox(index);
  }

  return (
    <div ref={ref} onClick={handleClick} className={`markdown-body ${className ?? ""}`.trim()} />
  );
}
