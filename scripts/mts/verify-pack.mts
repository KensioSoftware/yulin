#!/usr/bin/env -S pnpm tsx

/**
 * Packs the package exactly as `pnpm publish` would, installs the resulting
 * tarball into a throwaway project outside the repository, and imports every
 * export subpath from it.
 *
 * This catches publishes where `dist/` is stale or incomplete, which a local
 * build alone cannot detect because the repository working tree still has the
 * files that the tarball is missing.
 */

import { execa } from "execa";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");

/** Build artefacts that must never be published. */
const forbiddenTarballEntries = [
  ".tsbuildinfo",
  "/dist-hidden/",
  "/node_modules/",
];

interface PackageManifest {
  readonly name: string;
  readonly exports: Readonly<Record<string, ExportTarget>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

type ExportTarget =
  string | { readonly import: string; readonly types: string };

interface Subpath {
  /** Specifier a consumer would import, e.g. `@kensio/yulin/s3`. */
  readonly specifier: string;
  /** Package-relative path to the declaration file. */
  readonly types: string;
}

interface ImportResult {
  readonly specifier: string;
  readonly ok: boolean;
  readonly exportCount: number;
  readonly error?: string;
}

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

    const consumerDirectory = path.join(workDirectory, "consumer");
    await createConsumer(consumerDirectory, tarballPath, manifest);

    const results = await importSubpaths(consumerDirectory, subpaths);
    const missingTypes = await findMissingTypes(
      consumerDirectory,
      manifest,
      subpaths,
    );

    report(results, missingTypes);
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
 * A bare ESM project outside the repository, so module resolution cannot fall
 * back to the repository's own `node_modules` or source tree.
 */
async function createConsumer(
  consumerDirectory: string,
  tarballPath: string,
  manifest: PackageManifest,
): Promise<void> {
  await mkdir(consumerDirectory, { recursive: true });

  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "yulin-verify-pack", version: "0.0.0", private: true, type: "module" }, undefined, 2)}\n`,
    "utf8",
  );

  // Optional peers are installed so that subpaths depending on them are
  // exercised rather than skipped.
  const peers = Object.keys(manifest.peerDependencies ?? {});

  await execa("npm", ["install", "--silent", tarballPath, ...peers], {
    cwd: consumerDirectory,
  });

  console.log(`Installed tarball into ${consumerDirectory}.`);
}

/** Declaration files an export target points at but the tarball does not have. */
async function findMissingTypes(
  consumerDirectory: string,
  manifest: PackageManifest,
  subpaths: readonly Subpath[],
): Promise<readonly string[]> {
  const packageDirectory = path.join(
    consumerDirectory,
    "node_modules",
    manifest.name,
  );
  const missing: string[] = [];

  for (const subpath of subpaths) {
    if (!(await isFile(path.join(packageDirectory, subpath.types)))) {
      missing.push(`${subpath.specifier} -> ${subpath.types}`);
    }
  }

  return missing;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const entry = await stat(filePath);

    return entry.isFile();
  } catch {
    return false;
  }
}

/** Imports each subpath in a child process running inside the consumer. */
async function importSubpaths(
  consumerDirectory: string,
  subpaths: readonly Subpath[],
): Promise<readonly ImportResult[]> {
  const specifiers = subpaths.map((subpath) => subpath.specifier);
  const runnerPath = path.join(consumerDirectory, "import-subpaths.mjs");

  await writeFile(runnerPath, importRunnerSource(specifiers), "utf8");

  const { stdout } = await execa("node", [runnerPath], {
    cwd: consumerDirectory,
  });

  return JSON.parse(stdout) as readonly ImportResult[];
}

function importRunnerSource(specifiers: readonly string[]): string {
  return `const specifiers = ${JSON.stringify(specifiers, undefined, 2)};
const results = [];

for (const specifier of specifiers) {
  try {
    const module = await import(specifier);
    results.push({
      specifier,
      ok: true,
      exportCount: Object.keys(module).length,
    });
  } catch (error) {
    results.push({
      specifier,
      ok: false,
      exportCount: 0,
      error: \`\${error.code ?? ""} \${error.message}\`.trim().split("\\n")[0],
    });
  }
}

process.stdout.write(JSON.stringify(results));
`;
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
