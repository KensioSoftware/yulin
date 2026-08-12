import { readFile, stat } from "node:fs/promises";

import type { SimS3ObjectMetadata } from "../../object/s3-object.js";
import { SimS3Object } from "../../object/s3-object.js";
import { isMissingFilesystemPathError } from "./filesystem-path-exists.js";

interface FilesystemS3ObjectFile {
  readonly key: string;
  readonly filePath: string;
  readonly metadata: SimS3ObjectMetadata;
}

/**
 * Read a file as the Object a Bucket holds at a key, or nothing when the file
 * is not there.
 *
 * The file's own modification time becomes the Object's, since it is the one
 * thing about a mounted file that is not a guess: a directory is written to
 * behind S3's back, so when S3 was told about the Object says nothing useful.
 * Everything else a file cannot say for itself arrives here already decided.
 */
export async function filesystemS3ObjectFile(
  file: FilesystemS3ObjectFile,
): Promise<SimS3Object | undefined> {
  try {
    const [body, fileStats] = await Promise.all([
      // oxlint-disable-next-line security/detect-non-literal-fs-filename
      readFile(file.filePath),
      // oxlint-disable-next-line security/detect-non-literal-fs-filename
      stat(file.filePath),
    ]);

    return new SimS3Object({
      key: file.key,
      body,
      metadata: file.metadata,
      lastModified: fileStats.mtime,
    });
  } catch (error) {
    if (isMissingFilesystemPathError(error)) {
      return undefined;
    }

    /* v8 ignore next */
    throw error;
  }
}
