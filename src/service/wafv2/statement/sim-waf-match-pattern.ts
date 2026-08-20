import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

/**
 * Which headers or cookies a rule reads.
 */
export interface SimWafMatchPatternInput {
  readonly All?: unknown;
  readonly IncludedHeaders?: readonly string[] | undefined;
  readonly ExcludedHeaders?: readonly string[] | undefined;
  readonly IncludedCookies?: readonly string[] | undefined;
  readonly ExcludedCookies?: readonly string[] | undefined;
}

/**
 * Which of a request's headers or cookies a rule reads.
 */
export interface SimWafPatternSelection {
  readonly included: ReadonlySet<string> | undefined;
  readonly excluded: ReadonlySet<string> | undefined;
}

/**
 * Read the pattern a rule selects headers or cookies with, refusing anything
 * else.
 *
 * Real WAFv2 takes one of `All`, an included list or an excluded list, and a
 * list has to name something. A pattern naming two of them, or none, or an
 * empty list, would leave which headers the rule read up to the order they
 * happen to be checked in.
 */
export function requiredSimWafPatternSelection(
  pattern: SimWafMatchPatternInput | undefined,
  ruleName: string,
): SimWafPatternSelection {
  const included =
    pattern?.IncludedHeaders ?? pattern?.IncludedCookies ?? undefined;
  const excluded =
    pattern?.ExcludedHeaders ?? pattern?.ExcludedCookies ?? undefined;
  const named = [pattern?.All, included, excluded].filter(
    (selector) => selector !== undefined,
  );

  if (named.length !== 1 || included?.length === 0 || excluded?.length === 0) {
    invalidSimWafRule(
      ruleName,
      "A match pattern names All, one list of headers or cookies to include, " +
        "or one list to exclude",
    );
  }

  return { included: names(included), excluded: names(excluded) };
}

function names(listed: readonly string[] | undefined): Set<string> | undefined {
  return listed === undefined
    ? undefined
    : new Set(listed.map((name) => name.toLowerCase()));
}
