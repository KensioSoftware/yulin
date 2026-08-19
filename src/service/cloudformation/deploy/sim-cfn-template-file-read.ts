import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Read the template file a deployment names.
 *
 * A path with no file at it is refused by naming the resolved path and what
 * was expected there. A template under `cdk.out` is build output that a fresh
 * checkout has yet to write, and the filesystem error for it says only that
 * the path failed to open, which is what leaves callers writing their own
 * guard in front of the deployment.
 */
export async function readTemplateFile(templatePath: string): Promise<string> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    return await readFile(templatePath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(
        `No Sim CloudFormation template file at ${path.resolve(templatePath)}`,
        { cause: error },
      );
    }

    /* v8 ignore next */
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
