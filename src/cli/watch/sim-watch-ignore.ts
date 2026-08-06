import path from "node:path";

// Directories nothing worth restarting for is ever written into. `dist` is on
// the list because a dev script runs from source; a project that runs from its
// build output is watching the build's inputs anyway.
const ignoredDirectoryNames = new Set([
  ".cache",
  ".git",
  ".idea",
  ".next",
  ".nyc_output",
  ".tmp",
  ".turbo",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

// CDK writes each asset into its own directory inside its output directory.
// The template there is worth watching and the copies of the handler code
// beside it are not, since their source is being watched already.
//
// Only inside that output directory: `asset.` is an ordinary way to start the
// name of a source file, and `src/asset.config.ts` is a file someone edits.
const cdkOutputDirectoryName = "cdk.out";
const cdkAssetPrefix = "asset.";

// Editors write, rename and delete around the file being saved. Reacting to the
// working files means restarting several times for one save, or restarting for
// a file that is gone by the time anything reads it.
const editorFilePatterns = [
  /~$/u,
  /^\.#/u,
  /^#.*#$/u,
  /\.sw[a-p]$/u,
  /^\.goutputstream/u,
  /^\d{4}$/u,
  /^\.DS_Store$/u,
];

/**
 * Decides which changed paths are worth restarting for.
 *
 * A watch that fires on everything under the working directory fires mostly on
 * things the project generated, so the ignore list is what makes one save one
 * restart rather than a stream of them.
 */
export class SimWatchIgnore {
  /**
   * Whether a changed path should be passed over.
   */
  ignores(changedPath: string): boolean {
    const segments = changedPath.split(path.sep).filter(Boolean);
    const fileName = segments.at(-1) ?? "";

    return (
      segments.some((segment) => ignoredDirectoryNames.has(segment)) ||
      this.isCdkAsset(segments) ||
      editorFilePatterns.some((pattern) => pattern.test(fileName))
    );
  }

  private isCdkAsset(segments: readonly string[]): boolean {
    const at = segments.indexOf(cdkOutputDirectoryName);

    return (
      at !== -1 &&
      segments
        .slice(at + 1)
        .some((segment) => segment.startsWith(cdkAssetPrefix))
    );
  }
}
