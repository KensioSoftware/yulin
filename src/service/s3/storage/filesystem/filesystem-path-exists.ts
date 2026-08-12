import { stat } from "node:fs/promises";

/**
 * Whether a filesystem error is the one meaning nothing is at that path.
 *
 * Reading a file that is not there is not a failure to anything mapping a
 * directory onto a Bucket: it is an Object the Bucket does not hold. Every
 * other error still is one, so only this code is answered rather than raised.
 */
export function isMissingFilesystemPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Check whether a filesystem path exists.
 */
export async function filesystemPathExists(path: string): Promise<boolean> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFilesystemPathError(error)) {
      return false;
    }

    /* v8 ignore next */
    throw error;
  }
}
