import { assertArrayIncludes, assertArrayLength } from "@kensio/smartass";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import cloudFrontFunctionsJs2 from "../eslint/cffjs2.eslint.config.js";
import { cffJs2LintPlugin, cffJs2PluginName } from "./cff-js2-lint-plugin.js";
import {
  cffJs2Violations,
  supportedCffJs2Source,
} from "./cff-js2-lint.fixture.js";
import { cffJs2SyntaxRestrictions } from "./cff-js2-restriction.js";

/**
 * Lints a source string through the published ESLint config, exactly as a
 * consumer's `.cff.js` file would be.
 *
 * The typescript-eslint plugin is registered ahead of it because the published
 * config turns typescript-eslint rules off without owning the plugin, the same
 * way it arrives in a consumer's config that already has it.
 */
async function lintCffJs2(source: string): Promise<readonly string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { plugins: { "@typescript-eslint": tseslint.plugin } },
      ...cloudFrontFunctionsJs2,
    ] as never,
  });

  const [result] = await eslint.lintText(source, {
    filePath: "handler.cff.js",
  });

  return (result?.messages ?? []).map((message) => message.ruleId ?? "");
}

describe("Linting a CloudFront Functions JS2 file", () => {
  for (const violation of cffJs2Violations) {
    it(`reports ${violation.what}`, async () => {
      // Given a CloudFront Function using something JS2 will not run
      const source = violation.source;

      // When it is linted with the published config
      const reported = await lintCffJs2(source);

      // Then the rule for that construct is among what is reported
      assertArrayIncludes(reported, `${cffJs2PluginName}/${violation.rule}`);
    });
  }

  it("stays quiet on a function that respects the restrictions", async () => {
    // Given a function written the way JS2 wants it, with `var` and no sugar
    const source = supportedCffJs2Source;

    // When it is linted with the published config
    const reported = await lintCffJs2(source);

    // Then nothing is reported, including by the rules a modern-JavaScript
    // config would otherwise apply to it
    assertArrayLength(reported, 0);
  });

  it("covers every restriction with a case", () => {
    // Given the rules the plugin publishes
    const published = Object.keys(cffJs2LintPlugin.rules);

    // When each is looked for among the cases the tests above run
    const covered = new Set(
      cffJs2Violations.map((violation) => violation.rule),
    );

    // Then no rule ships without one, which is what stops a rule being added
    // and never exercised
    assertArrayLength(
      published.filter((rule) => !covered.has(rule)),
      0,
    );
  });

  it("names a rule for every syntax restriction", () => {
    // Given the restriction table the plugin is built from
    const restrictions = Object.keys(cffJs2SyntaxRestrictions);

    // When the plugin's rules are counted against it
    const ruleNames = Object.keys(cffJs2LintPlugin.rules);

    // Then each restriction became a rule, plus the globals rule that resolves
    // names through scope rather than by selector
    assertArrayLength(ruleNames, restrictions.length + 1);
  });
});
