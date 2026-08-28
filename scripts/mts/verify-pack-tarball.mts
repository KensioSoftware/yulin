/**
 * The checks against the packed tarball itself, before anything installs it.
 *
 * What the tarball holds and what it weighs are properties of the archive, and
 * both are read straight out of it with `tar`.
 */

import { execa } from "execa";
import { stat } from "node:fs/promises";

/** Build artefacts that must never be published. */
const forbiddenTarballEntries = [
  ".tsbuildinfo",
  "/dist-hidden/",
  "/node_modules/",
];

/**
 * What the tarball is allowed to weigh, unpacked and in files.
 *
 * Yulin gains about a megabyte and five hundred files a week, a simulated
 * service at a time, so these are a ratchet rather than a fixed ceiling: raise
 * them in the change that earns the growth. They sit far enough above the
 * package to leave a couple of months of ordinary work alone, and close enough
 * to catch a single change that alters what the build emits for every module.
 *
 * File count is the tighter of the two. Yulin is thousands of small modules
 * rather than a few large ones, and a consumer feels that in how long an
 * install takes to unpack far more than it feels the megabytes.
 *
 * The unpacked limit went from 20 MiB to 24 MiB when the documentation pages
 * joined the package. They add about two megabytes across 45 pages and an
 * index, taking the tarball to 17.83 MiB, and the gap above it is back to
 * what it was.
 */
const maximumUnpackedBytes = 24 * 1024 * 1024;
const maximumFileCount = 12_000;

/** Fails when the tarball carries a build artefact that must not ship. */
export async function assertTarballHygiene(tarballPath: string): Promise<void> {
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
 * Fails the verification when the tarball outgrows what the package is allowed
 * to ship, and reports what it weighs either way.
 *
 * A publish that suddenly carries far more than the last one is worth seeing
 * before it goes out, whether it came from a change to what the build emits or
 * from a directory that should never have been packed.
 */
export async function assertTarballSize(tarballPath: string): Promise<void> {
  const { size } = await stat(tarballPath);
  const { stdout } = await execa("tar", ["tzvf", tarballPath]);

  const entries = stdout.split("\n");
  const unpacked = entries.reduce(
    (total, entry) => total + entrySize(entry),
    0,
  );

  console.log(
    `Tarball is ${formatBytes(size)} packed, ${formatBytes(unpacked)} unpacked, in ${String(entries.length)} files.`,
  );

  const breaches = [
    unpacked > maximumUnpackedBytes
      ? `unpacked size is ${formatBytes(unpacked)}, over the ${formatBytes(maximumUnpackedBytes)} limit`
      : undefined,
    entries.length > maximumFileCount
      ? `file count is ${String(entries.length)}, over the ${String(maximumFileCount)} limit`
      : undefined,
  ].filter((breach) => breach !== undefined);

  if (breaches.length > 0) {
    throw new Error(
      `Tarball is too large to publish:\n${breaches.join("\n")}\n` +
        "Either stop shipping what it gained, or raise the limit in this script deliberately.",
    );
  }
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
