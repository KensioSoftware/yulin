import type { SimWafPatternSelection } from "./sim-waf-match-pattern.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

/**
 * One header, cookie or query argument, as WAF sees it.
 */
export interface SimWafNameValue {
  readonly name: string;
  readonly value: string;
}

/**
 * Whether a rule reads the names, the values, or both.
 */
export type SimWafMatchScope = "ALL" | "KEY" | "VALUE";

/**
 * Split a query string into its arguments without decoding them.
 *
 * Decoding is what the URL_DECODE text transformation is for, so a rule that
 * did not ask for it sees the argument as it arrived. Names are lower cased,
 * as WAF lower cases both sides before comparing a `SingleQueryArgument`.
 */
export function simWafQueryArguments(
  queryString: string,
): readonly SimWafNameValue[] {
  return queryString
    .split("&")
    .filter((pair) => pair !== "")
    .map((pair) => {
      const separator = pair.indexOf("=");

      return separator === -1
        ? { name: pair.toLowerCase(), value: "" }
        : {
            name: pair.slice(0, separator).toLowerCase(),
            value: pair.slice(separator + 1),
          };
    });
}

/**
 * Read the cookies one request sent.
 */
export function simWafCookies(headers: Headers): readonly SimWafNameValue[] {
  return (headers.get("cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie !== "")
    .map((cookie) => {
      const separator = cookie.indexOf("=");

      return separator === -1
        ? { name: cookie, value: "" }
        : {
            name: cookie.slice(0, separator),
            value: cookie.slice(separator + 1),
          };
    });
}

/**
 * Read the headers one request sent, lower cased as HTTP treats them.
 */
export function simWafHeaderEntries(
  headers: Headers,
): readonly SimWafNameValue[] {
  return [...headers].map(([name, value]) => ({ name, value }));
}

/**
 * Narrow a set of headers or cookies to the ones a rule inspects, and read the
 * part of each that it matches against.
 */
export function simWafPatternCandidates(properties: {
  readonly entries: readonly SimWafNameValue[];
  readonly selection: SimWafPatternSelection;
  readonly matchScope: SimWafMatchScope;
}): readonly string[] {
  const { entries, matchScope } = properties;
  const { included, excluded } = properties.selection;

  return entries
    .filter(
      (entry) =>
        (included === undefined || included.has(entry.name.toLowerCase())) &&
        (excluded === undefined || !excluded.has(entry.name.toLowerCase())),
    )
    .flatMap((entry) => scoped(entry, matchScope));
}

/**
 * Read the match scope a rule named, refusing anything else.
 */
export function requiredSimWafMatchScope(
  matchScope: string | undefined,
  ruleName: string,
): SimWafMatchScope {
  if (matchScope !== "ALL" && matchScope !== "KEY" && matchScope !== "VALUE") {
    invalidSimWafRule(
      ruleName,
      `The match scope ${String(matchScope)} is not valid`,
    );
  }

  return matchScope;
}

function scoped(
  entry: SimWafNameValue,
  matchScope: SimWafMatchScope,
): string[] {
  if (matchScope === "KEY") {
    return [entry.name];
  }

  return matchScope === "VALUE" ? [entry.value] : [entry.name, entry.value];
}
