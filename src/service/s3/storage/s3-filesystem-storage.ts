import type { SimS3BucketStorage } from "./s3-bucket-storage.js";
import { SimS3Object, SimS3ObjectMetadata } from "../object/s3-object.js";
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { FilesystemS3StorageSafety } from "./s3-filesystem-safety.js";

interface FilesystemS3BucketStorageProps {
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

  constructor(props: FilesystemS3BucketStorageProps) {
    this.safety = new FilesystemS3StorageSafety({
      allowedDirectoryNames: props.allowedDirectoryNames,
    });
    this.safety.assertSafeDirectoryPath(props.directoryPath);
    this.directoryPath = path.resolve(props.directoryPath);
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
        metadata: this.metadataForObjectKey(key),
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

          /* v8 ignore next -- defensive guard for filesystem race */
          if (object === undefined) {
            throw new Error(`Object listed but not found: ${key}`);
          }

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
   * Is it OK to change to a different storage implementation?
   * For now, we're assuming that a user should not need to change from a
   * filesystem storage at runtime, so this is always false.
   */
  allowChangeStorage(): boolean {
    return false;
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
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await stat(this.directoryPath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }

      /* v8 ignore next */
      throw error;
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

  /**
   * Make up reasonable metadata for an Object based on the file on disk.
   */
  private metadataForObjectKey(key: string): SimS3ObjectMetadata {
    const contentType = this.contentTypeForObjectKey(key);

    /* v8 ignore if -- defensive fallback */
    if (contentType === undefined) {
      return new SimS3ObjectMetadata();
    }

    return new SimS3ObjectMetadata({
      "content-type": contentType,
    });
  }

  /**
   * Guess a reasonable content type for an Object key based on its file
   * extension on disk.
   */
  private contentTypeForObjectKey(key: string): string | undefined {
    const extension = path.extname(key).toLowerCase();

    return contentTypesByExtension.get(extension);
  }
}

const contentTypesByExtension: ReadonlyMap<string, string> = new Map([
  [".css", "text/css"],
  [".eot", "application/vnd.ms-fontobject"],
  [".gif", "image/gif"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".png", "image/png"],
  [".otf", "font/otf"],
  [".svg", "image/svg+xml"],
  [".ttc", "font/collection"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml"],
]);
