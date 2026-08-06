import path from "node:path";

// Directories nothing worth restarting for is ever written into. `dist` is on
// the list because a dev script runs from source; a project that runs from its
// build output is watching the build's inputs anyway.
const ignoredDirectoryNames = new Set([
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

// CDK writes each asset into its own directory beside the template. The
// template is worth watching and the copies of the handler code beside it are
// not, since their source is being watched already.
const ignoredDirectoryPrefixes = ["asset.", ".cache"];

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
      segments.some((segment) => this.ignoredDirectory(segment)) ||
      editorFilePatterns.some((pattern) => pattern.test(fileName))
    );
  }

  private ignoredDirectory(segment: string): boolean {
    return (
      ignoredDirectoryNames.has(segment) ||
      ignoredDirectoryPrefixes.some((prefix) => segment.startsWith(prefix))
    );
  }
}
