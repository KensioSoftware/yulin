import { SimLogsUnsupportedOperationException } from "../error/sim-logs.error.js";
import {
  simLogsFilterTerms,
  type SimLogsFilterTerm,
} from "./sim-logs-filter-terms.js";

/**
 * The two pattern syntaxes real CloudWatch Logs reads structurally rather than
 * as text, recognised by the character they open with.
 */
const structuredPatternOpeners = new Map<string, string>([
  ["{", "JSON property"],
  ["[", "space delimited field"],
]);

/**
 * A plain text CloudWatch Logs filter pattern, and what it matches.
 *
 * Terms are matched as case sensitive substrings, which is how real CloudWatch
 * Logs matches them. Required terms must all appear, excluded terms must not
 * appear, and where the pattern carries `?` alternatives at least one of them
 * must appear.
 *
 * The structured syntaxes are refused rather than approximated. A pattern this
 * simulator cannot read is worth failing on: a filter quietly treated as
 * matching everything turns an assertion about one log line into an assertion
 * about any log line at all.
 */
export class SimLogsFilterPattern {
  readonly #terms: readonly SimLogsFilterTerm[];

  constructor(pattern?: string) {
    this.#terms = simLogsFilterTerms(refuseStructured(pattern ?? "").trim());
  }

  /**
   * Whether a log event message matches this pattern.
   *
   * A pattern with no terms matches everything, as an omitted or empty filter
   * pattern does on real CloudWatch Logs.
   */
  matches(message: string): boolean {
    return (
      this.every("required", (term) => message.includes(term)) &&
      this.every("excluded", (term) => !message.includes(term)) &&
      this.someAlternative(message)
    );
  }

  private every(
    kind: SimLogsFilterTerm["kind"],
    holds: (text: string) => boolean,
  ): boolean {
    return this.textOf(kind).every((text) => holds(text));
  }

  private someAlternative(message: string): boolean {
    const alternatives = this.textOf("optional");

    return (
      alternatives.length === 0 ||
      alternatives.some((text) => message.includes(text))
    );
  }

  private textOf(kind: SimLogsFilterTerm["kind"]): readonly string[] {
    return this.#terms
      .filter((term) => term.kind === kind)
      .map((term) => term.text);
  }
}

/**
 * Refuse a pattern written in one of the structured syntaxes.
 */
function refuseStructured(pattern: string): string {
  const opener = structuredPatternOpeners.get(pattern.trim().charAt(0));

  if (opener !== undefined) {
    throw new SimLogsUnsupportedOperationException(
      `Simulated CloudWatch Logs does not support ${opener} filter patterns ` +
        `yet: ${pattern}`,
    );
  }

  return pattern;
}
