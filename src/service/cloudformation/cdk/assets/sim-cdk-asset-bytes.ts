import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { SimZipArchiveBuilder } from "../../../../util/zip/zip-archive-builder.js";

/**
 * Read the publishable bytes for one CDK cloud assembly file asset.
 *
 * CDK stages two shapes of file asset in a cloud assembly. A "file" asset is
 * already a single file on disk, such as the stack template JSON or a prebuilt
 * layer zip, and publishes byte for byte. A "zip" asset is a directory that the
 * real `cdk-assets` publisher zips on its way to the staging bucket, so the
 * simulated publisher zips it here, in memory.
 */
export async function readSimCdkAssetBytes(
  sourcePath: string,
  packaging: string | undefined,
): Promise<Uint8Array> {
  if (packaging === "zip") {
    return await zipSimCdkAssetDirectory(sourcePath);
  }

  // oxlint-disable-next-line security/detect-non-literal-fs-filename
  return await readFile(sourcePath);
}

/**
 * Zip a CDK asset directory into Lambda-readable archive bytes.
 *
 * Entries are sorted so the same asset directory always produces the same
 * archive bytes, as a content-addressed CDK asset should.
 */
async function zipSimCdkAssetDirectory(
  directoryPath: string,
): Promise<Uint8Array> {
  const archivePaths = await assetArchivePaths(directoryPath);
  const files = await Promise.all(
    archivePaths.map(async (archivePath) => ({
      archivePath,
      // oxlint-disable-next-line security/detect-non-literal-fs-filename
      content: await readFile(path.join(directoryPath, archivePath)),
    })),
  );

  const builder = new SimZipArchiveBuilder();
  for (const file of files) {
    builder.addFile(file.archivePath, file.content);
  }

  return builder.toBytes();
}

/**
 * The archive-relative paths of every file in a CDK asset directory, in a
 * stable order and using zip forward-slash separators.
 */
async function assetArchivePaths(
  directoryPath: string,
): Promise<readonly string[]> {
  // oxlint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await readdir(directoryPath, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(directoryPath, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .toSorted((left, right) => left.localeCompare(right));
}
