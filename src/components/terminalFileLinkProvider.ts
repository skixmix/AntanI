import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { findTerminalFileReferences, type TerminalFileReference } from "../lib/terminalFileLinks";

const MAX_WRAPPED_LINK_LENGTH = 2_048;

export interface ResolvedTerminalFile {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
}

export type TerminalFileDestination =
  | {
      readonly kind: "ide";
      readonly projectId: string;
      readonly projectPath: string;
      readonly filePath: string;
    }
  | { readonly kind: "finder"; readonly filePath: string };

export type TerminalFileOpenTarget =
  | {
      readonly kind: "ide";
      readonly projectId: string;
      readonly projectPath: string;
      readonly file: ResolvedTerminalFile;
    }
  | { readonly kind: "finder"; readonly filePath: string };

interface TerminalFileLinkProviderOptions {
  readonly terminal: Terminal;
  readonly resolveFile: (referencePath: string) => Promise<TerminalFileDestination | null>;
  readonly onOpenFile: (target: TerminalFileOpenTarget) => void;
}

interface LogicalLine {
  readonly text: string;
  readonly startLineIndex: number;
}

function logicalLine(terminal: Terminal, bufferLineNumber: number): LogicalLine | null {
  const buffer = terminal.buffer.active;
  const lineIndex = bufferLineNumber - 1;
  const current = buffer.getLine(lineIndex);
  if (!current) return null;

  let startLineIndex = lineIndex;
  const before: string[] = [];
  let length = 0;
  if (current.isWrapped && current.translateToString(true)[0] !== " ") {
    let previousLineIndex = lineIndex - 1;
    let line = buffer.getLine(previousLineIndex);
    while (line && previousLineIndex >= 0 && length < MAX_WRAPPED_LINK_LENGTH) {
      startLineIndex = previousLineIndex;
      const content = line.translateToString(true);
      length += content.length;
      before.push(content);
      if (!line.isWrapped || content.includes(" ")) break;
      line = buffer.getLine(--previousLineIndex);
    }
    before.reverse();
  }

  const lines = [...before, current.translateToString(true)];
  length = 0;
  let nextLineIndex = lineIndex + 1;
  let next = buffer.getLine(nextLineIndex);
  while (next?.isWrapped && length < MAX_WRAPPED_LINK_LENGTH) {
    const content = next.translateToString(true);
    length += content.length;
    lines.push(content);
    if (content.includes(" ")) break;
    next = buffer.getLine(++nextLineIndex);
  }

  return { text: lines.join(""), startLineIndex };
}

function bufferPosition(
  terminal: Terminal,
  lineIndex: number,
  columnIndex: number,
  stringIndex: number,
): readonly [number, number] | null {
  const buffer = terminal.buffer.active;
  const cell = buffer.getNullCell();
  let currentLineIndex = lineIndex;
  let currentColumnIndex = columnIndex;
  let remaining = stringIndex;

  while (remaining > 0) {
    const line = buffer.getLine(currentLineIndex);
    if (!line) return null;
    for (let column = currentColumnIndex; column < line.length; column++) {
      line.getCell(column, cell);
      const chars = cell.getChars();
      if (cell.getWidth() === 0) continue;
      remaining -= chars.length || 1;
      if (remaining < 0) return [currentLineIndex, column];
    }
    currentLineIndex++;
    currentColumnIndex = 0;
  }

  return [currentLineIndex, currentColumnIndex];
}

function linkForReference(
  terminal: Terminal,
  startLineIndex: number,
  reference: TerminalFileReference,
  destination: TerminalFileDestination,
  onOpenFile: (target: TerminalFileOpenTarget) => void,
): ILink | null {
  const start = bufferPosition(terminal, startLineIndex, 0, reference.startIndex);
  if (!start) return null;
  const end = bufferPosition(terminal, start[0], start[1], reference.text.length);
  if (!end) return null;

  return {
    range: {
      start: { x: start[1] + 1, y: start[0] + 1 },
      end: { x: end[1], y: end[0] + 1 },
    },
    text: reference.text,
    activate: (event) => {
      if (!event.metaKey) return;
      switch (destination.kind) {
        case "ide":
          onOpenFile({
            kind: "ide",
            projectId: destination.projectId,
            projectPath: destination.projectPath,
            file: {
              filePath: destination.filePath,
              line: reference.line,
              column: reference.column,
            },
          });
          break;
        case "finder":
          onOpenFile(destination);
          break;
        default: {
          const unexpected: never = destination;
          return unexpected;
        }
      }
    },
  };
}

export function createTerminalFileLinkProvider(
  options: TerminalFileLinkProviderOptions,
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = logicalLine(options.terminal, bufferLineNumber);
      if (!line) {
        callback(undefined);
        return;
      }
      const references = findTerminalFileReferences(line.text);
      if (references.length === 0) {
        callback(undefined);
        return;
      }

      void Promise.all(
        references.map(async (reference) => {
          const destination = await options.resolveFile(reference.path).catch(() => null);
          if (!destination) return null;
          return linkForReference(
            options.terminal,
            line.startLineIndex,
            reference,
            destination,
            options.onOpenFile,
          );
        }),
      ).then((results) => {
        const links = results.filter((link): link is ILink => link !== null);
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
}
