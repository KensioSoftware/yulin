import { readdir } from "node:fs/promises";
import path from "node:path";

import type { FilesystemS3StorageSafety } from "./s3-filesystem-safety.js";
import { filesystemPathExists } from "./filesystem-path-exists.js";

interface FilesystemS3ObjectKeysProperties {
  readonly directoryPath: string;
  readonly safety: FilesystemS3StorageSafety;
}

/**
 * Maps between the Object keys of a Bucket and the files of a directory.
 *
 * A directory tree is a listing here, so the walk lives on its own rather than
 * in the storage class: files become keys relative to the directory root, with
 * platform separators normalised to the `/` an S3 key uses, and a key becomes
 * the file path under the root it names.
 */
export class FilesystemS3ObjectKeys {
  private readonly directoryPath: string;
  private readonly safety: FilesystemS3StorageSafety;

  constructor(properties: FilesystemS3ObjectKeysProperties) {
    this.directoryPath = properties.directoryPath;
    this.safety = properties.safety;
  }

  /**
   * List the Object keys under the storage directory, under a prefix when one
   * is given.
   *
   * A directory that is not there holds nothing, which is what an empty Bucket
   * looks like.
   */
  async list(prefix?: string): Promise<string[]> {
    if (!(await filesystemPathExists(this.directoryPath))) {
      return [];
    }

    const keys = await this.listInDirectory(this.directoryPath);

    return prefix === undefined
      ? keys
      : keys.filter((key) => key.startsWith(prefix));
  }

  /**
   * The file an Object key names, once the key is known to be safe to follow.
   *
   * The guard after resolving is defensive rather than the check that matters:
   * key validation has already rejected anything that could climb out, and this
   * is the assertion that it did.
   */
  filePathFor(key: string): string {
    this.safety.assertSafeObjectKey(key);

    const filePath = path.resolve(this.directoryPath, key);

    /* v8 ignore if -- defensive guard after object key validation */
    if (
      filePath !== this.directoryPath &&
      !filePath.startsWith(`${this.directoryPath}${path.sep}`)
    ) {
      throw new Error(
        `Invalid S3 Object key outside storage directory: ${key}`,
      );
    }

    return filePath;
  }

  private async listInDirectory(directoryPath: string): Promise<string[]> {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const keys: string[] = [];
    const nestedKeyPromises: Promise<string[]>[] = [];

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        nestedKeyPromises.push(this.listInDirectory(entryPath));
        continue;
      }

      if (entry.isFile()) {
        const key = path
          .relative(this.directoryPath, entryPath)
          .split(path.sep)
          .join("/");

        if (this.safety.isAllowedObjectKeyExtension(key)) {
          keys.push(key);
        }
      }
    }

    const nestedKeys = await Promise.all(nestedKeyPromises);

    return [...keys, ...nestedKeys.flat()];
  }
}
