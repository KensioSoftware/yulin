import { SimZipArchiveBuilder } from "../../../../util/zip/zip-archive-builder.js";

/**
 * Files to zip into a Lambda function code archive, keyed by archive path.
 */
export type LambdaCodeZipFiles = Record<string, string | Uint8Array>;

/**
 * Build real zip archive bytes for Lambda function code.
 *
 * A plain source string becomes a single index.js module, mirroring how
 * CloudFormation packages inline ZipFile template source. A files map zips
 * each entry at its archive path, like a bundled deployment package.
 *
 * The output is a real zip archive, so it is equally valid for the
 * CreateFunction Code.ZipFile input, for storing in sim S3 as an S3-located
 * code object, or for unzipping with real tooling.
 */
export function makeLambdaCodeZip(
  code: string | LambdaCodeZipFiles,
): Uint8Array {
  const builder = new SimZipArchiveBuilder();
  const fileEntries = Object.entries(codeZipFiles(code));
  for (const [filePath, content] of fileEntries) {
    builder.addFile(filePath, content);
  }
  return builder.toBytes();
}

function codeZipFiles(code: string | LambdaCodeZipFiles): LambdaCodeZipFiles {
  if (typeof code === "string") {
    return { "index.js": code };
  }
  return code;
}
