import type { SimS3BucketStorage } from "./s3-bucket-storage.js";
import { SimS3Object, SimS3ObjectMetadata } from "../object/s3-object.js";
import path from "node:path";
import { homedir } from "node:os";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

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
  private readonly allowedDirectoryNames: readonly string[];

  constructor(
    directoryPath: string,
    options: FilesystemS3BucketStorageOptions = {},
  ) {
    this.allowedDirectoryNames =
      options.allowedDirectoryNames ?? defaultAllowedDirectoryNames;
    this.assertSafeDirectoryPath(directoryPath);
    this.directoryPath = path.resolve(directoryPath);
  }

  /**
   * Get a simulated Object from a file in the directory.
   */
  async getObject(key: string): Promise<SimS3Object | undefined> {
    const filePath = this.filePathForObjectKey(key);

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const body = await readFile(filePath);
      return new SimS3Object(key, body, this.metadataForObjectKey(key));
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
    this.assertSafeObjectKey(key);

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

        if (this.isAllowedObjectKeyExtension(key)) {
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

    switch (extension) {
      case ".css": {
        return "text/css";
      }
      case ".gif": {
        return "image/gif";
      }
      case ".html":
      case ".htm": {
        return "text/html";
      }
      case ".ico": {
        return "image/x-icon";
      }
      case ".jpeg":
      case ".jpg": {
        return "image/jpeg";
      }
      case ".js":
      case ".mjs": {
        return "text/javascript";
      }
      case ".json": {
        return "application/json";
      }
      case ".map": {
        return "application/json";
      }
      case ".png": {
        return "image/png";
      }
      case ".svg": {
        return "image/svg+xml";
      }
      case ".txt": {
        return "text/plain";
      }
      case ".webp": {
        return "image/webp";
      }
      case ".xml": {
        return "application/xml";
      }
      default: {
        /* v8 ignore next */
        return undefined;
      }
    }
  }

  private assertSafeDirectoryPath(directoryPath: string): void {
    if (!path.isAbsolute(directoryPath)) {
      throw new Error(
        `Filesystem S3 storage directory path must be absolute: ${directoryPath}`,
      );
    }

    if (this.pathContainsParentDirectorySegment(directoryPath)) {
      throw new Error(
        `Filesystem S3 storage directory path must not contain '..': ${directoryPath}`,
      );
    }

    const resolvedDirectoryPath = path.resolve(directoryPath);
    const parsedDirectoryPath = path.parse(resolvedDirectoryPath);

    if (resolvedDirectoryPath === parsedDirectoryPath.root) {
      throw new Error(
        `Filesystem S3 storage directory path must not be a filesystem root: ${directoryPath}`,
      );
    }

    if (resolvedDirectoryPath === path.resolve(homedir())) {
      throw new Error(
        `Filesystem S3 storage directory path must not be the user home directory: ${directoryPath}`,
      );
    }

    const directoryName = path.basename(resolvedDirectoryPath);

    if (!this.allowedDirectoryNames.includes(directoryName)) {
      throw new Error(
        `Filesystem S3 storage directory name must be one of: ${this.allowedDirectoryNames.join(
          ", ",
        )}. Got: ${directoryName}`,
      );
    }
  }

  private assertSafeObjectKey(key: string): void {
    if (path.isAbsolute(key)) {
      throw new Error(`S3 Object key must not be an absolute path: ${key}`);
    }

    if (this.pathContainsParentDirectorySegment(key)) {
      throw new Error(`S3 Object key must not contain '..': ${key}`);
    }

    if (!this.isAllowedObjectKeyExtension(key)) {
      throw new Error(`S3 Object key has unsupported file extension: ${key}`);
    }
  }

  private pathContainsParentDirectorySegment(value: string): boolean {
    return value.split(/[\\/]/u).includes("..");
  }

  private isAllowedObjectKeyExtension(key: string): boolean {
    return allowedObjectFileExtensions.has(path.extname(key).toLowerCase());
  }
}

/**
 * Options for filesystem-based simulated S3 Bucket storage.
 */
export interface FilesystemS3BucketStorageOptions {
  /**
   * Directory names that are safe to use as filesystem storage roots.
   */
  readonly allowedDirectoryNames?: readonly string[];
}

/**
 * Default directory names that are safe to use as filesystem storage roots.
 */
const defaultAllowedDirectoryNames = [
  "assets",
  "build",
  "dist",
  "out",
  "public",
  "static",
  "www",
] as const;

/**
 * Cautious list of allowed file extensions for simulated S3 objects. This is to
 * try and avoid reading or writing other files that might be unsafe.
 */
const allowedObjectFileExtensions = new Set([
  ".css",
  ".gif",
  ".htm",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".png",
  ".svg",
  ".txt",
  ".webp",
  ".xml",
]);
