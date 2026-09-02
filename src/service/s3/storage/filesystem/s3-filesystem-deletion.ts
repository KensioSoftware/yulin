import { unlink } from "node:fs/promises";

import { isMissingFilesystemPathError } from "./filesystem-path-exists.js";

/**
 * Remove one file, reporting whether there was one to remove.
 *
 * A key the directory does not hold is what an idempotent S3 delete of a
 * missing Object looks like, and the Bucket raises no removal event for it.
 * The directory the file was in stays where it is, since a Bucket has no
 * directories for an empty one to be.
 */
export async function unlinkFilesystemS3File(
  filePath: string,
): Promise<boolean> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    await unlink(filePath);
  } catch (error) {
    if (isMissingFilesystemPathError(error)) {
      return false;
    }

    /* v8 ignore next */
    throw error;
  }

  return true;
}
