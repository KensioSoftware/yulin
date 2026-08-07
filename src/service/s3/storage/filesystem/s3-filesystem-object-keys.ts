import { readdir } from "node:fs/promises";
import path from "node:path";

import type { FilesystemS3StorageSafety } from "./s3-filesystem-safety.js";
import { filesystemPathExists } from "./filesystem-path-exists.js";

interface FilesystemS3ObjectKeysProperties {
  readonly directoryPath: string;
  readonly safety: FilesystemS3StorageSafety;
}

/**
 * Finds the Object keys a storage directory holds.
 *
 * A directory tree is a listing here, so the walk lives on its own rather than
 * in the storage class: files become keys relative to the directory root, with
 * platform separators normalised to the `/` an S3 key uses.
 */
export class FilesystemS3ObjectKeys {
  private readonly directoryPath: string;
  private readonly safety: FilesystemS3StorageSafety;

  constructor(properties: FilesystemS3ObjectKeysProperties) {
    this.directoryPath = properties.directoryPath;
    this.safety = properties.safety;
  }

  /**
   * List every Object key under the storage directory.
   *
   * A directory that is not there holds nothing, which is what an empty Bucket
   * looks like.
   */
  async list(): Promise<string[]> {
    if (!(await filesystemPathExists(this.directoryPath))) {
      return [];
    }

    return await this.listInDirectory(this.directoryPath);
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
