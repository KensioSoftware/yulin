import { SimAthenaSetUpError } from "../error/sim-athena.error.js";

/** One Parquet file's rows, keyed by the names the file's own schema holds. */
export type SimAthenaParquetRow = Record<string, unknown>;

/** What one Parquet file is read with. */
export interface SimAthenaParquetOptions {
  readonly file: ArrayBuffer;
  readonly compressors: Readonly<
    Record<string, (bytes: Uint8Array, size: number) => Uint8Array>
  >;

  /** Whether a `BYTE_ARRAY` column reads as text, which a Hive string is. */
  readonly utf8: boolean;
}

/** The one thing the engine needs out of `hyparquet`. */
export interface SimAthenaParquetReader {
  parquetReadObjects(
    options: SimAthenaParquetOptions,
  ): Promise<SimAthenaParquetRow[]>;
}

/**
 * The package name, held as a variable rather than written into the `import()`
 * so that building this repository never turns an optional dependency into a
 * required one.
 */
const parquetPackage = "hyparquet";

const missingPackage =
  `Simulated Athena needs hyparquet to read a Parquet table. Add it to your ` +
  `project as a dev dependency, or declare what each query over that table ` +
  `answers with through results().`;

/**
 * The Parquet reader, loaded the first time a query reaches a Parquet table.
 *
 * `hyparquet` is an optional peer dependency, so a project querying only JSON
 * and CSV tables never installs it. Loading here rather than in `enable()` is
 * what keeps that true, since the engine has no idea what a test will query
 * until it does.
 *
 * The package name is a parameter so that a test can ask for one that is not
 * installed and read what a project without the package is told.
 */
export async function simAthenaParquetReader(
  packageName: string = parquetPackage,
): Promise<SimAthenaParquetReader> {
  const module = await importedReader(packageName);
  const { parquetReadObjects } = module;

  if (typeof parquetReadObjects !== "function") {
    throw new SimAthenaSetUpError(
      `${packageName} carries no parquetReadObjects. ${missingPackage}`,
    );
  }

  return { parquetReadObjects };
}

async function importedReader(
  packageName: string,
): Promise<Partial<SimAthenaParquetReader>> {
  try {
    return (await import(packageName)) as Partial<SimAthenaParquetReader>;
  } catch (error) {
    const missing = new SimAthenaSetUpError(missingPackage);

    missing.cause = error;

    throw missing;
  }
}
