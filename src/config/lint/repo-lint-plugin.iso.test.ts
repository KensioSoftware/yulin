import { assertArrayIncludes, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  preferSpecificAssertionsRuleName,
  repoLintPlugin,
  repoSyntaxRestrictions,
  smartassSyntaxRestrictions,
} from "./repo-lint-plugin.js";

/** Every selector the plugin reports on, whichever rule carries it. */
function publishedSelectors(): readonly string[] {
  return Object.values(repoLintPlugin.rules).flatMap((rule) =>
    Object.keys(
      rule.create({ sourceCode: { getScope: () => scope } } as never),
    ),
  );
}

/** Enough of a scope for `create` to run; no rule here reads it. */
const scope = { through: [], variables: [] };

describe("This repository's own lint plugin", () => {
  it("publishes a rule for each restriction the repository sets", () => {
    // Given the restrictions written down in the plugin's own module
    const own = Object.keys(repoSyntaxRestrictions);

    // When each is looked for among the rules the plugin publishes
    const published = new Set(Object.keys(repoLintPlugin.rules));
    const missing = own.filter((name) => !published.has(name));

    // Then every one of them is a rule. A restriction that stops being a rule
    // stops being enforced, and nothing else would say so.
    assertArrayLength(missing, 0);
    assertArrayLength(own, 3);
  });

  it("carries every selector the shared assertion config brings", () => {
    // Given what @kensio/smartass asks for, read from the config it publishes
    const wanted = smartassSyntaxRestrictions().map(
      (restriction) => restriction.selector,
    );

    // When each of those selectors is looked for in the rule that rehouses them
    const rule = Object.entries(repoLintPlugin.rules).find(
      ([name]) => name === preferSpecificAssertionsRuleName,
    )?.[1];
    const carried = new Set(
      Object.keys(
        rule?.create({ sourceCode: { getScope: () => scope } } as never) ?? {},
      ),
    );
    const missing = wanted.filter((selector) => !carried.has(selector));

    // Then none was lost on the way across. Under ESLint these arrived through
    // a `no-restricted-syntax` block that a second config could replace whole,
    // and one silently did for 265 commits.
    assertArrayLength(missing, 0);
    assertArrayLength(wanted, 47);
  });

  it("keeps the repository's own restrictions alongside them", () => {
    // Given every selector the plugin reports on, from all of its rules
    const selectors = publishedSelectors();

    // When this repository's own are looked for among them
    // Then they are still there, next to the shared ones rather than replaced
    // by them, which is the arrangement that failed before
    for (const restriction of Object.values(repoSyntaxRestrictions)) {
      assertArrayIncludes(selectors, restriction.selector);
    }
  });
});
