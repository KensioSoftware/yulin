import type { SimS3BucketStorage } from "../s3-bucket-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { FilesystemS3StorageSafety } from "./s3-filesystem-safety.js";
import { metadataForFilesystemS3ObjectKey } from "./s3-filesystem-object-metadata.js";
import { filesystemPathExists } from "./filesystem-path-exists.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface FilesystemS3BucketStorageProperties {
  readonly directoryPath: string;
  readonly allowedDirectoryNames?: readonly string[];
}

/**
 * Maps simulated S3 Objects to files under a directory.
 * This is useful for local development, such as serving a static website
 * locally out of simulated S3.
 * This class has some simple checks to reduce the risk of reading or writing
 * files that might be unsafe, but it cannot completely protect against all
 * potential safety issues.
 */
export class FilesystemS3BucketStorage implements SimS3BucketStorage {
  private readonly directoryPath: string;
  private readonly safety: FilesystemS3StorageSafety;

  constructor(properties: FilesystemS3BucketStorageProperties) {
    this.safety = new FilesystemS3StorageSafety({
      allowedDirectoryNames: properties.allowedDirectoryNames,
    });
    this.safety.assertSafeDirectoryPath(properties.directoryPath);
    this.directoryPath = path.resolve(properties.directoryPath);
  }

  /**
   * Get a simulated Object from a file in the directory.
   */
  async getObject(key: string): Promise<SimS3Object | undefined> {
    if (!this.safety.isAllowedObjectKeyExtension(key)) {
      this.safety.assertSafeObjectKeyPath(key);
      return undefined;
    }

    const filePath = this.filePathForObjectKey(key);

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const body = await readFile(filePath);
      return new SimS3Object({
        key,
        body,
        metadata: metadataForFilesystemS3ObjectKey(key),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }

      /* v8 ignore next */
      throw error;
    }
  }

  /**
   * List simulated Objects based on files in the directory.
   */
  async listObjects(prefix?: string): Promise<SimS3Object[]> {
    const objectKeys = await this.listObjectKeys();

    return await Promise.all(
      objectKeys
        .filter((key) => prefix === undefined || key.startsWith(prefix))
        .map(async (key) => {
          const object = await this.getObject(key);
          assertDefined(object, "Sim S3 filesystem storage listed object");

          return object;
        }),
    );
  }

  /**
   * Store a simulated Object as a file in the directory.
   */
  async putObject(object: SimS3Object): Promise<void> {
    const filePath = this.filePathForObjectKey(object.key);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(path.dirname(filePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(filePath, object.body);
  }

  private filePathForObjectKey(key: string): string {
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

  private async listObjectKeys(): Promise<string[]> {
    if (!(await filesystemPathExists(this.directoryPath))) {
      return [];
    }

    return await this.listObjectKeysInDirectory(this.directoryPath);
  }

  private async listObjectKeysInDirectory(
    directoryPath: string,
  ): Promise<string[]> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const keys: string[] = [];
    const nestedKeyPromises: Promise<string[]>[] = [];

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        nestedKeyPromises.push(this.listObjectKeysInDirectory(entryPath));
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
