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

const quote = '"';
const escape = "\\";

/**
 * Read the terms out of a plain text CloudWatch Logs filter pattern.
 *
 * A term is a bare word or a quoted phrase, optionally prefixed with `?` to
 * make it one of the alternatives or `-` to exclude it. Whitespace separates
 * terms, and only a quoted phrase may carry a space of its own.
 *
 * The scan reads characters with `charAt` rather than by index, which answers
 * with the empty string past the end instead of undefined. That keeps the
 * whole of this file free of both the assertions and the bounds checks an
 * indexed scan would need for a position the loop conditions already rule out.
 */
export function simLogsFilterTerms(
  pattern: string,
): readonly SimLogsFilterTerm[] {
  const terms: SimLogsFilterTerm[] = [];
  let index = 0;

  while (index < pattern.length) {
    const character = pattern.charAt(index);

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const kind = termKindsByPrefix.get(character);
    const start = kind === undefined ? index : index + 1;
    const read =
      pattern.charAt(start) === quote
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
    const character = pattern.charAt(index);

    if (character === escape && index + 1 < pattern.length) {
      text += pattern.charAt(index + 1);
      index += 2;
      continue;
    }

    if (character === quote) {
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
