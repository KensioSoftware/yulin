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
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertTypesUsable,
  createConsumer,
  findMissingTypes,
  importSubpaths,
} from "./verify-pack-consumer.mjs";
import type {
  ImportResult,
  PackageManifest,
  Subpath,
} from "./verify-pack.type.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");

/** Build artefacts that must never be published. */
const forbiddenTarballEntries = [
  ".tsbuildinfo",
  "/dist-hidden/",
  "/node_modules/",
];

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

  const workDirectory = await mkdtemp(
    path.join(os.tmpdir(), "yulin-verify-pack-"),
  );

  try {
    console.log(`Packing ${manifest.name} …`);
    const tarballPath = await pack(workDirectory);

    await assertTarballHygiene(tarballPath);
    await reportTarballSize(tarballPath);

    const consumerDirectory = path.join(workDirectory, "consumer");
    await createConsumer(consumerDirectory, tarballPath, manifest);

    const results = await importSubpaths(consumerDirectory, subpaths);
    const missingTypes = await findMissingTypes(
      consumerDirectory,
      manifest,
      subpaths,
    );

    report(results, missingTypes);

    await assertTypesUsable(consumerDirectory);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function readManifest(): Promise<PackageManifest> {
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");

  return JSON.parse(raw) as PackageManifest;
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

  if (entry === undefined) {
    throw new Error("npm pack produced no tarball");
  }

  return path.join(destination, entry.filename);
}

async function assertTarballHygiene(tarballPath: string): Promise<void> {
  const { stdout } = await execa("tar", ["tzf", tarballPath]);
  const entries = stdout.split("\n");

  const offenders = entries.filter((entry) =>
    forbiddenTarballEntries.some((forbidden) => entry.includes(forbidden)),
  );

  if (offenders.length > 0) {
    throw new Error(
      `Tarball contains build artefacts that must not be published:\n${offenders.join("\n")}`,
    );
  }

  console.log(`Tarball is clean (${String(entries.length)} entries).`);
}

/**
 * Reports what the tarball weighs, so a publish that suddenly ships far more
 * than the last one is visible before it goes out.
 */
async function reportTarballSize(tarballPath: string): Promise<void> {
  const { size } = await stat(tarballPath);
  const { stdout } = await execa("tar", ["tzvf", tarballPath]);

  const unpacked = stdout
    .split("\n")
    .reduce((total, entry) => total + entrySize(entry), 0);

  console.log(
    `Tarball is ${formatBytes(size)} packed, ${formatBytes(unpacked)} unpacked.`,
  );
}

/**
 * Size of one `tar tzvf` entry, whichever of BSD tar and GNU tar produced it.
 *
 * The two put the size in different columns, but in both it is the last
 * whole-number field before the modification date.
 */
function entrySize(entry: string): number {
  const fields = entry.trim().split(/\s+/).slice(0, 5);
  const sizes = fields.filter((field) => /^\d+$/.test(field));
  const size = sizes.at(-1);

  return size === undefined ? 0 : Number(size);
}

function formatBytes(bytes: number): string {
  const mib = bytes / 1024 / 1024;

  return `${mib.toFixed(2)} MiB (${bytes.toLocaleString("en-GB")} bytes)`;
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
