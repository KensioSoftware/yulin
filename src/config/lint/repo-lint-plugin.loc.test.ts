import { assertArrayIncludes, assertArrayLength } from "@kensio/smartass";
import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { repoLintPluginName } from "./repo-lint-plugin.js";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * The plugins carrying the syntax restrictions this repository lints with.
 *
 * `@kensio/smartass` is here rather than left to its own tests because its
 * advice reaching this repository is what has failed before: under ESLint it
 * arrived as a `no-restricted-syntax` block, and a second config setting the
 * same rule turned it off for 265 commits with nothing to say so.
 */
const jsPlugins: readonly {
  readonly name: string;
  readonly specifier: string;
}[] = [
  {
    name: repoLintPluginName,
    specifier: path.join(
      projectRoot,
      "src",
      "config",
      "lint",
      "repo-lint-plugin.ts",
    ),
  },
  {
    name: "smartass",
    // Oxlint resolves a specifier from the config file's own directory, and
    // the config this test writes lives outside the repository. Resolving the
    // package's export here rather than pointing at a path inside it keeps the
    // test going through the entry point `.oxlintrc.json` names.
    specifier: fileURLToPath(import.meta.resolve("@kensio/smartass/oxlint")),
  },
];

/**
 * A source file that should trip one rule, and the rule it should trip.
 *
 * Reading a plugin's rule list back would prove only that the list exists.
 * These prove Oxlint loads the plugin and the selectors match real syntax,
 * which is the part that would break silently.
 */
const cases: readonly {
  readonly plugin: string;
  readonly rule: string;
  readonly source: string;
}[] = [
  {
    plugin: repoLintPluginName,
    rule: "assert-defined-guard",
    source: [
      "export function read(value: string | undefined): string {",
      '  if (value === undefined) { throw new Error("no value"); }',
      "  return value;",
      "}",
    ].join("\n"),
  },
  {
    plugin: repoLintPluginName,
    rule: "assert-not-null-guard",
    source: [
      "export function read(value: string | null): string {",
      '  if (value === null) { throw new Error("no value"); }',
      "  return value;",
      "}",
    ].join("\n"),
  },
  {
    plugin: repoLintPluginName,
    rule: "no-reused-props",
    source: [
      "export class Thing {",
      "  private readonly props: { name: string };",
      "  constructor(props: { name: string }) { this.props = props; }",
      "  name(): string { return this.props.name; }",
      "}",
    ].join("\n"),
  },
  {
    plugin: "smartass",
    rule: "prefer-specific-assertions",
    source: [
      "declare function assertIdentical(a: unknown, b: unknown): void;",
      "export function check(value: boolean): void {",
      "  assertIdentical(value, true);",
      "}",
    ].join("\n"),
  },
];

/** Every rule under test, turned on and nothing else with it. */
const enabledRules = Object.fromEntries(
  cases.map((testCase) => [`${testCase.plugin}/${testCase.rule}`, "error"]),
);

interface OxlintReport {
  readonly diagnostics: readonly { readonly code: string }[];
}

/**
 * Lints one source through Oxlint with only these plugins turned on.
 *
 * The fixture goes outside the repository because Oxlint honours `.gitignore`,
 * and a fixture under the repository's own `.tmp/` would be skipped rather than
 * linted — leaving a test that passes by finding nothing.
 */
async function lintWithOxlint(source: string): Promise<readonly string[]> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yulin-repo-lint-"));

  try {
    const filePath = path.join(directory, "case.ts");

    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- a temporary directory this test just made
    await writeFile(filePath, source, "utf8");

    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- as above, this test's own directory
    await writeFile(
      path.join(directory, ".oxlintrc.json"),
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins,
        rules: enabledRules,
      }),
      "utf8",
    );

    const { stdout } = await execa(
      path.join(projectRoot, "node_modules", ".bin", "oxlint"),
      [
        "--config",
        path.join(directory, ".oxlintrc.json"),
        "--format",
        "json",
        filePath,
      ],
      // The working directory is the repository so that Node resolves what the
      // plugins import. Node strips the types itself, so no loader is passed:
      // tsx in the path breaks eslint-plugin-no-secrets.
      { cwd: projectRoot, reject: false },
    );

    const report = JSON.parse(stdout) as OxlintReport;

    return report.diagnostics.map((diagnostic) => diagnostic.code);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Linting this repository with its syntax restriction plugins", () => {
  for (const testCase of cases) {
    it(`reports ${testCase.plugin}/${testCase.rule}`, async () => {
      // Given a file written the way the restriction says not to
      const source = testCase.source;

      // When Oxlint lints it with only these plugins turned on
      const reported = await lintWithOxlint(source);

      // Then the rule for that restriction is what reported it, which means
      // Oxlint loaded the plugin — this repository's from TypeScript source,
      // smartass's from the package — and the selector matched
      assertArrayIncludes(reported, `${testCase.plugin}(${testCase.rule})`);
    });
  }

  it("stays quiet on code that respects the restrictions", async () => {
    // Given code that guards with the helpers and asserts specifically
    const source = [
      'import { assertDefined, assertStringLength } from "@kensio/smartass";',
      "export function check(value: string | undefined): void {",
      '  assertDefined(value, "value");',
      "  assertStringLength(value, 3);",
      "}",
    ].join("\n");

    // When Oxlint lints it with the same rules
    const reported = await lintWithOxlint(source);

    // Then nothing is reported, so the restrictions are not simply firing on
    // everything put in front of them
    assertArrayLength(reported, 0);
  });
});
