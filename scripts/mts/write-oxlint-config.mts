#!/usr/bin/env -S pnpm tsx

/**
 * Writes the published `.oxlintrc.json` into the package root from the same
 * rule definitions the ESLint config uses.
 *
 * Oxlint reads JSON, and TypeScript does not emit JSON, so the file has to be
 * produced rather than compiled. Generating it here rather than committing a
 * second copy is what stops the two published configs from drifting: a rule
 * added to the plugin reaches both, or neither.
 *
 * It sits in the package root because a consumer extends it by writing its
 * path into `node_modules` in full, Oxlint having no package-name resolution
 * in `extends`. A path through `dist/` would put the build's layout in every
 * consumer's config file.
 */

import { stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { cloudFrontFunctionsJs2Oxlint } from "../../src/config/oxlint/index.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");

const outputPath = path.join(projectRoot, "cffjs2.oxlintrc.json");

/**
 * Oxlint resolves a plugin specifier against the config file, and finds out it
 * cannot only when a consumer runs it. Checking here means a change to what
 * `dist/` looks like fails the build that caused it.
 */
async function assertPluginsResolve(): Promise<void> {
  for (const plugin of cloudFrontFunctionsJs2Oxlint.jsPlugins) {
    const pluginPath = path.resolve(path.dirname(outputPath), plugin.specifier);

    try {
      await stat(pluginPath);
    } catch {
      throw new Error(
        `${outputPath} names a plugin at ${plugin.specifier}, which the build did not emit (looked for ${pluginPath}).`,
      );
    }
  }
}

async function main(): Promise<void> {
  await writeFile(
    outputPath,
    `${JSON.stringify(cloudFrontFunctionsJs2Oxlint, undefined, 2)}\n`,
    "utf8",
  );

  await assertPluginsResolve();

  // This runs inside `prepack`, and `npm pack --json` gives its own output on
  // stdout, so saying anything there would be parsed as part of it.
  console.error(`Wrote ${path.relative(projectRoot, outputPath)}.`);
}

await main();
