import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "../error/sim-logs.error.js";

export type SimLogsFilterTermKind = "required" | "optional" | "excluded";

export interface SimLogsFilterTerm {
  readonly kind: SimLogsFilterTermKind;
  readonly text: string;
}

const termKindsByPrefix = new Map<string, SimLogsFilterTermKind>([
  ["?", "optional"],
  ["-", "excluded"],
]);

/**
 * Read the terms out of a plain text CloudWatch Logs filter pattern.
 *
 * A term is a bare word or a quoted phrase, optionally prefixed with `?` to
 * make it one of the alternatives or `-` to exclude it. Whitespace separates
 * terms, and only a quoted phrase may carry a space of its own.
 */
export function simLogsFilterTerms(pattern: string): readonly SimLogsFilterTerm[] {
  const terms: SimLogsFilterTerm[] = [];
  let index = 0;

  while (index < pattern.length) {
    if (pattern[index] === undefined || /\s/.test(pattern[index] as string)) {
      index += 1;
      continue;
    }

    const kind = termKindsByPrefix.get(pattern[index] as string);
    const start = kind === undefined ? index : index + 1;
    const read =
      pattern[start] === '"'
        ? readQuoted(pattern, start)
        : readBare(pattern, start);

    terms.push({ kind: kind ?? "required", text: refuseUnreadable(read.text) });
    index = read.next;
  }

  return terms;
}

interface SimLogsFilterTermRead {
  readonly text: string;
  readonly next: number;
}

/**
 * Read a quoted phrase, which may hold spaces and escaped quotes.
 */
function readQuoted(pattern: string, start: number): SimLogsFilterTermRead {
  let text = "";
  let index = start + 1;

  while (index < pattern.length) {
    const character = pattern[index] as string;

    if (character === "\\" && pattern[index + 1] !== undefined) {
      text += pattern[index + 1] as string;
      index += 2;
      continue;
    }

    if (character === '"') {
      return { text, next: index + 1 };
    }

    text += character;
    index += 1;
  }

  throw new SimLogsInvalidParameterException(
    "Invalid filter pattern: a quoted term was not closed",
  );
}

/**
 * Read a bare word, which runs to the next space.
 */
function readBare(pattern: string, start: number): SimLogsFilterTermRead {
  const remainder = pattern.slice(start);
  const length = remainder.search(/\s/);
  const text = length === -1 ? remainder : remainder.slice(0, length);

  return { text, next: start + text.length };
}

/**
 * Refuse a term this simulator would otherwise match on the wrong terms.
 *
 * A regular expression term is the one piece of plain text pattern syntax that
 * is not a substring match, so treating it as one would match the wrong events
 * rather than fewer of them.
 */
function refuseUnreadable(text: string): string {
  if (text.length === 0) {
    throw new SimLogsInvalidParameterException(
      "Invalid filter pattern: a term was empty",
    );
  }

  if (text.length > 1 && text.startsWith("%") && text.endsWith("%")) {
    throw new SimLogsUnsupportedOperationException(
      `Simulated CloudWatch Logs does not support regular expression filter ` +
        `terms yet: ${text}`,
    );
  }

  return text;
}
