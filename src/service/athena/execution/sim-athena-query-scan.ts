import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { simAthenaScanFailureReason } from "./sim-athena-scan-failure.js";
import {
  simAthenaScannedBytes,
  type SimAthenaScannedObjects,
} from "./sim-athena-scanned-bytes.js";

interface SimAthenaQueryScanRequest {
  readonly prefixes: readonly string[];
  readonly result: SimAthenaResolvedResult;
  readonly objects: SimAthenaScannedObjects | undefined;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * What one query scanned, or why it could not be measured.
 *
 * A declaration wins, so every test written before anything was measured keeps
 * working and a test can still drive the cutoff without seeding an object.
 * Listing goes under the caller that started the query, the way the result
 * write does, and a caller who cannot read the data fails here.
 *
 * A string is the failure reason. A number is the figure.
 */
export async function simAthenaQueryScan(
  request: SimAthenaQueryScanRequest,
): Promise<number | string> {
  const declared = request.result.declaredBytesScanned;

  if (declared !== undefined) {
    return declared;
  }

  if (request.objects === undefined || request.prefixes.length === 0) {
    return 0;
  }

  try {
    return await simAthenaScannedBytes({
      prefixes: request.prefixes,
      s3: request.objects,
      caller: request.caller,
    });
  } catch (error) {
    return simAthenaScanFailureReason(error, request.prefixes);
  }
}
