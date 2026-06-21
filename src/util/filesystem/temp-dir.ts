import { mkdir, mkdtemp, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { repoPath } from "./path.js";

/**
 * Create a temporary directory and return its path.
 */
export async function makeTempDir(): Promise<string> {
  const tmpDirPath = repoPath(".tmp");

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(tmpDirPath, { recursive: true });

  return await mkdtemp(path.join(tmpDirPath, "yulin-test-"));
}

/**
 * Convenience wrapper for working with a temporary test directory.
 */
export class TempDir {
  private readonly dirPathPromise: Promise<string>;
  private dirPath: string | undefined;

  constructor() {
    this.dirPathPromise = makeTempDir();
  }

  /**
   * Return the absolute path to this temporary directory.
   */
  path(): string {
    if (this.dirPath === undefined) {
      throw new Error(
        "TempDir path has not yet been resolved. Call resolvePath() or writeFile() first.",
      );
    }
    return this.dirPath;
  }

  /**
   * Return the absolute path to a file or directory inside this temporary directory.
   */
  join(...pathParts: string[]): string {
    return path.join(this.path(), ...pathParts);
  }

  /**
   * Wait for the temporary directory path to resolve and return it.
   */
  async resolvePath(): Promise<string> {
    this.dirPath = await this.dirPathPromise;
    return this.dirPath;
  }

  /**
   * Write a file inside this temporary directory, creating parent directories as needed.
   */
  async writeFile(
    pathParts: string | string[],
    content: string,
  ): Promise<void> {
    await this.resolvePath();
    const filePath = this.join(
      ...(Array.isArray(pathParts) ? pathParts : [pathParts]),
    );

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(path.dirname(filePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fsWriteFile(filePath, content);
  }
}
