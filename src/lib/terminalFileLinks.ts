export interface TerminalFileReference {
  readonly text: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly startIndex: number;
}

const PATH_BODY = String.raw`(?:[A-Za-z0-9_@.%+~-]+\/)*[A-Za-z0-9_@.%+~-]+\.[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?`;
const FILE_URL_PATTERN = String.raw`file:\/\/\/(${PATH_BODY})(?::(\d+)(?::(\d+))?)?(?:#L(\d+)(?:,(\d+))?)?`;
const PLAIN_PATH_PATTERN = String.raw`(^|[\s"'\x60([{])((?:\/|\.{1,2}\/)?${PATH_BODY})(?::(\d+)(?::(\d+))?)?`;

function position(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function overlaps(
  reference: TerminalFileReference,
  others: readonly TerminalFileReference[],
): boolean {
  const endIndex = reference.startIndex + reference.text.length;
  return others.some((other) => {
    const otherEndIndex = other.startIndex + other.text.length;
    return reference.startIndex < otherEndIndex && endIndex > other.startIndex;
  });
}

export function findTerminalFileReferences(text: string): TerminalFileReference[] {
  const references: TerminalFileReference[] = [];

  for (const match of text.matchAll(new RegExp(FILE_URL_PATTERN, "g"))) {
    const encodedPath = match[1];
    if (!encodedPath || match.index === undefined) continue;
    let path: string;
    try {
      path = `/${decodeURIComponent(encodedPath)}`;
    } catch (error) {
      if (error instanceof URIError) continue;
      throw error;
    }
    references.push({
      text: match[0],
      path,
      line: position(match[4] ?? match[2]),
      column: position(match[5] ?? match[3]),
      startIndex: match.index,
    });
  }

  for (const match of text.matchAll(new RegExp(PLAIN_PATH_PATTERN, "g"))) {
    const prefix = match[1] ?? "";
    const path = match[2];
    if (!path || match.index === undefined) continue;
    const reference: TerminalFileReference = {
      text: match[0].slice(prefix.length),
      path,
      line: position(match[3]),
      column: position(match[4]),
      startIndex: match.index + prefix.length,
    };
    if (!overlaps(reference, references)) references.push(reference);
  }

  return references.sort((left, right) => left.startIndex - right.startIndex);
}
