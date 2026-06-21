/* eslint-disable security/detect-non-literal-fs-filename */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const directoryName = path.dirname(filename);

const repoRoot = findRepoRoot([directoryName, process.cwd()]);

/**
 * Resolves a path relative to the repository root.
 */
export function repoPath(pathFromRepoRoot = ""): string {
  return path.join(repoRoot, pathFromRepoRoot);
}

/**
 * Finds the repository root by walking upward from likely starting directories.
 */
function findRepoRoot(startDirectories: readonly string[]): string {
  for (const startDirectory of startDirectories) {
    const foundRoot = findRepoRootFrom(startDirectory);

    if (foundRoot !== undefined) {
      return foundRoot;
    }
  }

  /* v8 ignore next */
  throw new Error(
    `Could not find repository root from: ${startDirectories.join(", ")}`,
  );
}

/**
 * Finds the repository root by walking upward from one directory.
 */
function findRepoRootFrom(startDirectory: string): string | undefined {
  let currentDirectory = path.resolve(startDirectory);

  for (let level = 0; level < 100; level++) {
    if (isRepoRoot(currentDirectory)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    /* v8 ignore if */
    if (parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }

  /* v8 ignore next */
  return undefined;
}

/**
 * Checks whether a directory looks like this repository's root.
 */
function isRepoRoot(directory: string): boolean {
  return (
    path.basename(directory) === "yulin" &&
    fs.existsSync(path.join(directory, "package.json")) &&
    fs.existsSync(path.join(directory, "tsconfig.json")) &&
    fs.existsSync(path.join(directory, "pnpm-workspace.yaml"))
  );
}
