import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";

/**
 * The token a truncated ListObjectsV2 page hands back to resume from.
 *
 * Real S3 treats this as opaque and so should a caller, so the simulation makes
 * it look opaque rather than handing back the key it stands for. What it
 * actually holds is that key, encoded, which is all a listing needs to carry on
 * from where it stopped.
 */
export function simS3ContinuationToken(lastKey: string): string {
  return Buffer.from(lastKey, "utf8").toString("base64");
}

/**
 * Read the key a continuation token resumes after.
 *
 * A token that was not one this simulation issued is refused rather than
 * quietly listing from somewhere arbitrary, since a caller inventing one has a
 * bug that a plausible-looking page would hide. The check is a round trip,
 * because base64 decoding accepts a good deal that never encodes to the same
 * thing again.
 */
export function simS3ContinuationTokenKey(token: string): string {
  const key = Buffer.from(token, "base64").toString("utf8");

  if (key === "" || simS3ContinuationToken(key) !== token) {
    throw new SimS3InvalidArgument(
      `Not a continuation token simulated S3 issued: ${token}`,
    );
  }

  return key;
}
