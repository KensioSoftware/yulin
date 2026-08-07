import {
  assertArrayLength,
  assertArrayMinLength,
  assertIdentical,
} from "@kensio/smartass";
import { ESLint } from "eslint";
import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import cloudFrontFunctionsJs2 from "../eslint/cffjs2.eslint.config.js";
import { cffJs2PluginName } from "../lint/cff-js2-lint-plugin.js";
import {
  cffJs2Violations,
  supportedCffJs2Source,
} from "../lint/cff-js2-lint.fixture.js";
import { cloudFrontFunctionsJs2Oxlint } from "./cffjs2.oxlint.config.js";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

/** The one fixture written the way JS2 wants it. */
const supportedFixtureName = "case-00.cff.js";

/** One thing a linter said, in a form the other linter can be compared to. */
interface Finding {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  readonly column: number;
}

/** A directory of `.cff.js` fixtures with an Oxlint config beside them. */
interface Fixtures {
  readonly directory: string;
  readonly files: readonly string[];
}

interface OxlintReport {
  readonly diagnostics: readonly {
    readonly code: string;
    readonly filename: string;
    readonly labels: readonly {
      readonly span: { readonly line: number; readonly column: number };
    }[];
  }[];
}

/**
 * Only the plugin's own findings are compared.
 *
 * Each linter brings its own built-in rules and its own defaults for which of
 * them are on, so comparing everything would measure the linters rather than
 * the shared plugin, which is the thing that has to agree.
 */
function isPluginRule(rule: string): boolean {
  return rule.startsWith(`${cffJs2PluginName}/`);
}

function asText(findings: readonly Finding[]): string {
  return findings
    .map(
      (finding) =>
        `${finding.file}:${String(finding.line)}:${String(finding.column)} ${finding.rule}`,
    )
    .toSorted((left, right) => left.localeCompare(right))
    .join("\n");
}

/**
 * Writes the fixtures, runs the body against them and clears up after it.
 *
 * They go outside the repository because Oxlint honours `.gitignore`: a
 * fixture under the repository's own `.tmp/` would be skipped without being
 * linted, and a comparison of two empty lists would pass.
 */
async function withFixtures<T>(
  body: (fixtures: Fixtures) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "yulin-cff-parity-"));

  try {
    const sources = [
      supportedCffJs2Source,
      ...cffJs2Violations.map((violation) => violation.source),
    ];

    const files = await Promise.all(
      sources.map(async (source, index) => {
        const filePath = path.join(
          directory,
          `case-${String(index).padStart(2, "0")}.cff.js`,
        );

        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a temporary directory this test just made
        await writeFile(filePath, source, "utf8");

        return filePath;
      }),
    );

    // The published fragment names the plugin as it sits in `dist/`, which a
    // test running from source has not built. Pointing that same fragment at
    // the TypeScript entry point is the only change made to it here.
    const oxlintConfig = {
      ...cloudFrontFunctionsJs2Oxlint,
      jsPlugins: cloudFrontFunctionsJs2Oxlint.jsPlugins.map((plugin) => ({
        ...plugin,
        specifier: path.join(
          projectRoot,
          "src",
          "config",
          "lint",
          "cff-js2-oxlint-plugin.ts",
        ),
      })),
    };

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- as above, this test's own directory
    await writeFile(
      path.join(directory, ".oxlintrc.json"),
      JSON.stringify(oxlintConfig, undefined, 2),
      "utf8",
    );

    return await body({ directory, files });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function lintWithEslint(fixtures: Fixtures): Promise<readonly Finding[]> {
  const eslint = new ESLint({
    // The fixtures live outside the repository, and ESLint ignores a file that
    // sits outside the directory it was pointed at.
    cwd: fixtures.directory,
    overrideConfigFile: true,
    overrideConfig: [
      // The published config turns typescript-eslint rules off without owning
      // the plugin, the same way it arrives in a consumer's config that
      // already has it.
      { plugins: { "@typescript-eslint": tseslint.plugin } },
      ...cloudFrontFunctionsJs2,
    ] as never,
  });

  const results = await eslint.lintFiles([...fixtures.files]);

  return results.flatMap((result) =>
    result.messages
      .filter((message) => isPluginRule(message.ruleId ?? ""))
      .map((message) => ({
        file: path.basename(result.filePath),
        rule: message.ruleId ?? "",
        line: message.line,
        column: message.column,
      })),
  );
}

async function lintWithOxlint(fixtures: Fixtures): Promise<readonly Finding[]> {
  const { stdout } = await execa(
    path.join(projectRoot, "node_modules", ".bin", "oxlint"),
    [
      "--config",
      path.join(fixtures.directory, ".oxlintrc.json"),
      "--format",
      "json",
      ...fixtures.files,
    ],
    {
      // Oxlint runs JS plugins in its own Node process, so the loader that
      // reads the plugin straight from TypeScript source is passed through the
      // environment, and the working directory is the repository so that the
      // loader and the plugin's own imports both resolve.
      cwd: projectRoot,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name, not an identifier
      env: { NODE_OPTIONS: "--import tsx" },
      reject: false,
    },
  );

  const report = JSON.parse(stdout) as OxlintReport;

  return report.diagnostics
    .map((diagnostic) => ({
      diagnostic,
      matched: /^(?<plugin>[^(]+)\((?<name>[^)]+)\)$/u.exec(diagnostic.code),
    }))
    .map((entry) => ({
      file: path.basename(entry.diagnostic.filename),
      rule: `${entry.matched?.groups?.["plugin"] ?? ""}/${entry.matched?.groups?.["name"] ?? ""}`,
      line: entry.diagnostic.labels[0]?.span.line ?? 0,
      column: entry.diagnostic.labels[0]?.span.column ?? 0,
    }))
    .filter((finding) => isPluginRule(finding.rule));
}

describe("Linting CloudFront Functions JS2 with either linter", () => {
  it("reports the same restrictions in the same places", async () => {
    await withFixtures(async (fixtures) => {
      // Given the same fixtures, and the two published configs over one plugin
      const fromEslint = await lintWithEslint(fixtures);
      const fromOxlint = await lintWithOxlint(fixtures);

      // When what each linter said is lined up finding by finding
      const oxlintText = asText(fromOxlint);
      const eslintText = asText(fromEslint);

      // Then neither found anything the other missed, and nothing landed in a
      // different place, which is what a shared plugin has to guarantee
      assertIdentical(oxlintText, eslintText);
    });
  });

  it("finds the restrictions rather than agreeing on silence", async () => {
    await withFixtures(async (fixtures) => {
      // Given fixtures holding a case for every rule the plugin publishes
      const fromOxlint = await lintWithOxlint(fixtures);

      // When Oxlint's findings are counted against the cases put in front of it
      // Then it really did run the plugin, so the comparison above is between
      // two lists of findings and not between two empty ones
      assertArrayMinLength(fromOxlint, cffJs2Violations.length);
    });
  });

  it("leaves a supported function alone", async () => {
    await withFixtures(async (fixtures) => {
      // Given the fixture written the way JS2 wants it
      const eslintFindings = await lintWithEslint(fixtures);
      const oxlintFindings = await lintWithOxlint(fixtures);

      // When each linter's findings for that file are picked out
      const fromEslint = eslintFindings.filter(
        (finding) => finding.file === supportedFixtureName,
      );
      const fromOxlint = oxlintFindings.filter(
        (finding) => finding.file === supportedFixtureName,
      );

      // Then neither reports it, so the restrictions are not simply firing on
      // everything they are pointed at
      assertArrayLength(fromEslint, 0);
      assertArrayLength(fromOxlint, 0);
    });
  });
});
