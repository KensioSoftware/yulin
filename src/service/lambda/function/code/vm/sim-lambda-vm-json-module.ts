import type { SimZipArchive } from "../../../../../util/zip/zip-archive.js";

/**
 * Load a JSON module from the function code archive, as Node.js CommonJS
 * require does for .json files: the module exports the parsed JSON value.
 */
export function loadJsonModule(
  archive: SimZipArchive,
  filePath: string,
): unknown {
  const source = archive.file(filePath).toString();
  try {
    return JSON.parse(source);
  } catch (error) {
    let message = String(error);
    if (error instanceof Error) {
      message = error.message;
    }
    throw new Error(`Cannot parse JSON module ${filePath}: ${message}`, {
      cause: error,
    });
  }
}
