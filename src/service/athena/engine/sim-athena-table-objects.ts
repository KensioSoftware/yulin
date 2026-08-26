import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaScannedObjects } from "../execution/sim-athena-scanned-objects.js";

/**
 * The narrow slice of simulated S3 the query engine reads a table through.
 *
 * Listing is what measuring a query already needed. Opening an object is what
 * the engine adds, since it answers from the rows rather than from the sizes.
 * `SimS3` structurally implements both.
 */
export interface SimAthenaTableObjects extends SimAthenaScannedObjects {
  getObject(
    command: { input: { Bucket: string; Key: string } },
    options?: { caller: SimAwsCaller },
  ): Promise<{ Body?: AsyncIterable<Uint8Array> | undefined }>;
}

/**
 * Whether this simulated S3 can open an object as well as list one.
 *
 * A standalone `SimAthena` has neither, and the engine turns every query down
 * there because nothing holds the data it would answer from.
 */
export function simAthenaTableObjects(
  s3: Partial<SimAthenaTableObjects> | undefined,
): SimAthenaTableObjects | undefined {
  return s3?.listObjectsV2 === undefined || s3.getObject === undefined
    ? undefined
    : (s3 as SimAthenaTableObjects);
}

/** One object's bytes, read as UTF-8 text. */
export async function simAthenaObjectText(
  objects: SimAthenaTableObjects,
  bucket: string,
  key: string,
  caller: SimAwsCaller | undefined,
): Promise<string> {
  const got = await objects.getObject(
    { input: { Bucket: bucket, Key: key } },
    caller === undefined ? undefined : { caller },
  );

  const chunks = await Array.fromAsync(got.Body ?? []);

  return new TextDecoder().decode(Buffer.concat(chunks));
}
