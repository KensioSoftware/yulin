import path from "node:path";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { findRepoRootFrom, repoPath } from "./path.js";
import { TemporaryDirectory } from "./temporary-directory.js";

describe("Repository root resolution", () => {
  it("stops at a checkout whose directory is not named after the repo", async () => {
    // Given a checkout nested inside another one, in a directory named after a
    // branch rather than after the repository, as a git worktree is
    const worktree = await checkoutIn(["worktrees", "some-branch"]);

    // When the root is resolved from a directory inside it
    const foundRoot = findRepoRootFrom(path.join(worktree, "src", "util"));

    // Then it is the worktree, not the checkout the worktree sits inside
    assertIdentical(foundRoot, worktree);
  });

  it("walks past a package that is not the workspace root", async () => {
    // Given a nested package carrying its own manifest and TypeScript config
    const temporaryDirectory = new TemporaryDirectory();
    await temporaryDirectory.writeFile(["nested", "package.json"], "{}");
    await temporaryDirectory.writeFile(["nested", "tsconfig.json"], "{}");

    // When the root is resolved from inside that package
    const foundRoot = findRepoRootFrom(temporaryDirectory.join("nested"));

    // Then the walk continues past it, up to the checkout it belongs to
    assertIdentical(foundRoot, repoPath());
  });
});

/**
 * Writes the marker files of a checkout into a temporary directory, returning
 * the path they were written to.
 */
async function checkoutIn(directoryParts: string[]): Promise<string> {
  const temporaryDirectory = new TemporaryDirectory();

  await temporaryDirectory.writeFile([...directoryParts, "package.json"], "{}");
  await temporaryDirectory.writeFile(
    [...directoryParts, "tsconfig.json"],
    "{}",
  );
  await temporaryDirectory.writeFile(
    [...directoryParts, "pnpm-workspace.yaml"],
    "",
  );

  return temporaryDirectory.join(...directoryParts);
}
