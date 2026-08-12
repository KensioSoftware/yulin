import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";

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
  // One open handle for both, because the bytes and the time they were written
  // have to describe the same file. A mounted directory is rebuilt while it is
  // being served, so reading the path twice can pair one file's content with
  // its replacement's timestamp.
  const handle = await openFileToRead(file.filePath);

  if (handle === undefined) {
    return undefined;
  }

  try {
    const [body, fileStats] = await Promise.all([
      handle.readFile(),
      handle.stat(),
    ]);

    return new SimS3Object({
      key: file.key,
      body,
      metadata: file.metadata,
      lastModified: fileStats.mtime,
    });
  } finally {
    await handle.close();
  }
}

/**
 * Open a file, or answer with nothing when there is no such file, since a key
 * a Bucket does not hold is not a failure to read.
 */
async function openFileToRead(
  filePath: string,
): Promise<FileHandle | undefined> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    return await open(filePath);
  } catch (error) {
    if (isMissingFilesystemPathError(error)) {
      return undefined;
    }

    /* v8 ignore next */
    throw error;
  }
}
