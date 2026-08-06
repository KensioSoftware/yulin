import type { SimS3BucketStorage } from "../s3-bucket-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { FilesystemS3StorageSafety } from "./s3-filesystem-safety.js";
import { metadataForFilesystemS3ObjectKey } from "./s3-filesystem-object-metadata.js";
import { FilesystemS3ObjectKeys } from "./s3-filesystem-object-keys.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3NotImplemented } from "../../error/sim-s3.error.js";

interface FilesystemS3BucketStorageProperties {
  readonly directoryPath: string;
  readonly allowedDirectoryNames?: readonly string[];
  readonly additionalFileExtensions?: readonly string[];
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
  private readonly objectKeys: FilesystemS3ObjectKeys;

  constructor(properties: FilesystemS3BucketStorageProperties) {
    this.safety = new FilesystemS3StorageSafety({
      allowedDirectoryNames: properties.allowedDirectoryNames,
      additionalFileExtensions: properties.additionalFileExtensions,
    });
    this.safety.assertSafeDirectoryPath(properties.directoryPath);
    this.directoryPath = path.resolve(properties.directoryPath);
    this.objectKeys = new FilesystemS3ObjectKeys({
      directoryPath: this.directoryPath,
      safety: this.safety,
    });
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
    const objectKeys = await this.objectKeys.list();

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

  /**
   * Refuse to remove the file backing a simulated Object.
   *
   * This is stricter than real S3, deliberately. `mountBucketFilesystem` points
   * a Bucket at an ordinary directory of the user's, and the safety checks here
   * are local-development tooling rather than a sandbox boundary. Unlinking
   * someone's files because a test called DeleteObject is the wrong default, so
   * filesystem-backed Buckets are read and written but never emptied.
   */
  deleteObject(key: string): Promise<boolean> {
    return Promise.reject(
      new SimS3NotImplemented(
        `Simulated S3 will not delete ${key} from filesystem-backed storage ` +
          `at ${this.directoryPath}, because it would remove a real file. ` +
          `Use the default in-memory Bucket storage to simulate deletion.`,
      ),
    );
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
}
