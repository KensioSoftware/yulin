import { stat } from "node:fs/promises";

/**
 * Check whether a filesystem path exists.
 */
export async function filesystemPathExists(path: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    /* v8 ignore next */
    throw error;
  }
}
