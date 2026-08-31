import {
  assertArrayEmpty,
  assertArrayIncludes,
  assertArrayLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { repoLintPlugin, repoSyntaxRestrictions } from "./repo-lint-plugin.js";

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
    assertArrayEmpty(missing);
    assertArrayLength(own, 3);
  });

  it("reports each restriction on the syntax it names", () => {
    // Given every selector the plugin reports on, from all of its rules
    const selectors = publishedSelectors();

    // When each restriction's own selector is looked for among them
    // Then it is there, so a rule that exists is also a rule that is wired to
    // the syntax it was written for
    for (const restriction of Object.values(repoSyntaxRestrictions)) {
      assertArrayIncludes(selectors, restriction.selector);
    }

    assertArrayLength(selectors, 3);
  });
});
