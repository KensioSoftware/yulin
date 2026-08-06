import fs from "node:fs";
import path from "node:path";

/**
 * Works out which path a filesystem event was about.
 *
 * Node reports a watch event as the watched target plus a file name, and both
 * halves have cases where that is not the whole story. A watch on a single file
 * reports that file whatever name the event carries. A directory watch reports
 * a change to the directory itself with no name at all, and on macOS with the
 * directory's own name, neither of which says anything about a file in it.
 *
 * Wrong answers here are restarts nobody asked for, so this is kept apart from
 * the watching and answered on its own.
 */
export class SimWatchEventPath {
  private readonly target: string;
  private readonly recursive: boolean;

  constructor(target: string, recursive: boolean) {
    this.target = target;
    this.recursive = recursive;
  }

  /**
   * The path that changed, or nothing when the event named none.
   */
  of(fileName: string | null): string | undefined {
    if (!this.recursive) {
      return this.target;
    }

    if (fileName === null || fileName.length === 0) {
      return undefined;
    }

    const changedPath = path.join(this.target, fileName);

    if (this.namesTheDirectoryItself(fileName, changedPath)) {
      return undefined;
    }

    return changedPath;
  }

  /**
   * A directory holding a file of its own name is unusual but allowed, so the
   * one that does not exist is the event about the directory.
   */
  private namesTheDirectoryItself(
    fileName: string,
    changedPath: string,
  ): boolean {
    return (
      fileName === path.basename(this.target) &&
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      !fs.existsSync(changedPath)
    );
  }
}
