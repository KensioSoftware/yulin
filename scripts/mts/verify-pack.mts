#!/usr/bin/env -S pnpm tsx

/**
 * Packs the package exactly as `pnpm publish` would, installs the resulting
 * tarball into a throwaway project outside the repository, and imports every
 * export subpath from it.
 *
 * This catches publishes where `dist/` is stale or incomplete, which a local
 * build alone cannot detect because the repository working tree still has the
 * files that the tarball is missing.
 *
 * It also compiles a consumer file that names the types Yulin's own API asks
 * for, which catches a type a consumer cannot name because the package never
 * exports it.
 */

import { execa } from "execa";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertDefined } from "../../src/util/type-guard/defined.js";
import {
  assertTypesUsable,
  createConsumer,
  findMissingTypes,
  importSubpaths,
} from "./verify-pack-consumer.mjs";
import {
  assertDocumentationPublished,
  assertFileExportsResolve,
  assertOxlintConfigExtendable,
} from "./verify-pack-files.mjs";
import {
  assertTarballHygiene,
  assertTarballSize,
} from "./verify-pack-tarball.mjs";
import type {
  FileExport,
  ImportResult,
  PackageManifest,
  Subpath,
} from "./verify-pack.type.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");

/**
 * Exports a consumer imports by name, keyed by export subpath.
 *
 * A subpath resolving does not mean the export a consumer reaches for is in it,
 * so the names an ordinary consumer uses are named here.
 */
const requiredExports = new Map<string, readonly string[]>([
  [
    ".",
    [
      "SimAws",
      "isSimAwsAccountId",
      "makeSimAwsAccountId",
      "simAwsAccountId",
      "SimInvalidAwsAccountId",
    ],
  ],
  ["./cloudformation", ["SimCloudFormation"]],
]);

async function main(): Promise<void> {
  const manifest = await readManifest();
  const subpaths = collectSubpaths(manifest);
  const fileExports = collectFileExports(manifest);

  const workDirectory = await mkdtemp(
    path.join(os.tmpdir(), "yulin-verify-pack-"),
  );

  try {
    console.log(`Packing ${manifest.name} …`);
    const tarballPath = await pack(workDirectory);

    await assertTarballHygiene(tarballPath);
    await assertTarballSize(tarballPath);

    const consumerDirectory = path.join(workDirectory, "consumer");
    await createConsumer(consumerDirectory, tarballPath, manifest);

    const results = await importSubpaths(consumerDirectory, subpaths);
    const missingTypes = await findMissingTypes(
      consumerDirectory,
      manifest,
      subpaths,
    );

    report(results, missingTypes);

    assertFileExportsResolve(consumerDirectory, fileExports);
    await assertOxlintConfigExtendable(consumerDirectory, manifest);
    await assertDocumentationPublished(consumerDirectory, manifest);
    await assertTypesUsable(consumerDirectory);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function readManifest(): Promise<PackageManifest> {
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");

  return JSON.parse(raw) as PackageManifest;
}

/**
 * Every export subpath that names a file rather than a module.
 *
 * `collectSubpaths` passes over these, because importing a JSON file is not
 * what a consumer does with one. They are resolved instead.
 */
function collectFileExports(manifest: PackageManifest): readonly FileExport[] {
  const fileExports: FileExport[] = [];

  for (const [key, target] of Object.entries(manifest.exports)) {
    if (typeof target === "string") {
      fileExports.push({
        specifier: `${manifest.name}${key.slice(1)}`,
        target,
      });
    }
  }

  return fileExports;
}

/** Every importable export subpath, excluding plain file exports. */
function collectSubpaths(manifest: PackageManifest): readonly Subpath[] {
  const subpaths: Subpath[] = [];

  for (const [key, target] of Object.entries(manifest.exports)) {
    if (typeof target === "string") {
      continue;
    }

    const suffix = key === "." ? "" : key.slice(1);

    subpaths.push({
      specifier: `${manifest.name}${suffix}`,
      types: target.types,
      requiredExports: requiredExports.get(key) ?? [],
    });
  }

  return subpaths;
}

/**
 * Runs the real pack, which triggers the `prepack` hook and therefore a clean
 * rebuild.
 */
async function pack(destination: string): Promise<string> {
  const { stdout } = await execa(
    "npm",
    ["pack", "--pack-destination", destination, "--json"],
    { cwd: projectRoot },
  );

  const [entry] = JSON.parse(stdout) as readonly {
    readonly filename: string;
  }[];

  assertDefined(entry, "npm pack produced no tarball");

  return path.join(destination, entry.filename);
}

function report(
  results: readonly ImportResult[],
  missingTypes: readonly string[],
): void {
  for (const result of results) {
    console.log(
      result.ok
        ? `  ok   ${result.specifier} (${String(result.exportCount)} exports)`
        : `  FAIL ${result.specifier} — ${result.error ?? "unknown error"}`,
    );
  }

  for (const missing of missingTypes) {
    console.log(`  FAIL ${missing} — declaration file missing from tarball`);
  }

  const failures = results.filter((result) => !result.ok).length;

  if (failures > 0 || missingTypes.length > 0) {
    throw new Error(
      `Packed tarball is not publishable: ${String(failures)} of ${String(results.length)} export subpaths failed to import, ${String(missingTypes.length)} declaration file(s) missing.`,
    );
  }

  console.log(
    `\nAll ${String(results.length)} export subpaths import from the tarball, with declarations.`,
  );
}

await main();
