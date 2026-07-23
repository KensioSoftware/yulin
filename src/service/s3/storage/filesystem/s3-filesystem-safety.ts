import { homedir } from "node:os";
import path from "node:path";

interface FilesystemS3StorageSafetyProperties {
  readonly allowedDirectoryNames?: readonly string[] | undefined;
}

/**
 * Safety checks for filesystem-based simulated S3 storage.
 *
 * These checks reduce the risk of reading or writing files outside an intended
 * static-asset directory, but they are not a complete sandbox.
 */
export class FilesystemS3StorageSafety {
  private readonly allowedDirectoryNames: readonly string[];

  constructor(properties: FilesystemS3StorageSafetyProperties = {}) {
    const { allowedDirectoryNames = defaultAllowedDirectoryNames } = properties;
    this.allowedDirectoryNames = allowedDirectoryNames;
  }

  /**
   * Throw an error if a directory path appears to be unsafe for use as S3
   * filesystem storage.
   */
  assertSafeDirectoryPath(directoryPath: string): void {
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

  /**
   * Throw an error if a sim S3 Object key appears to be unsafe for use in
   * filesystem storage.
   */
  assertSafeObjectKey(key: string): void {
    this.assertSafeObjectKeyPath(key);

    if (!this.isAllowedObjectKeyExtension(key)) {
      throw new Error(`S3 Object key has unsupported file extension: ${key}`);
    }
  }

  /**
   * Throw an error if a sim S3 Object key path appears to be unsafe for use in
   * filesystem storage.
   */
  assertSafeObjectKeyPath(key: string): void {
    if (path.isAbsolute(key)) {
      throw new Error(`S3 Object key must not be an absolute path: ${key}`);
    }

    if (this.pathContainsParentDirectorySegment(key)) {
      throw new Error(`S3 Object key must not contain '..': ${key}`);
    }
  }

  /**
   * Check whether a sim S3 Object key has an allowed file extension.
   */
  isAllowedObjectKeyExtension(key: string): boolean {
    return allowedObjectFileExtensions.has(path.extname(key).toLowerCase());
  }

  private pathContainsParentDirectorySegment(value: string): boolean {
    return value.split(/[\\/]/u).includes("..");
  }
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
  ".eot",
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
  ".otf",
  ".png",
  ".svg",
  ".ttc",
  ".ttf",
  ".txt",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);
