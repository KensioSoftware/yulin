import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import type { SimAthenaCatalog } from "../table/sim-athena-table-resolution.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";
import {
  simAthenaCutoffRefusal,
  simAthenaPlanQuery,
} from "./sim-athena-query-refusal.js";
import { simAthenaQueryScan } from "./sim-athena-query-scan.js";
import type { SimAthenaScannedObjects } from "./sim-athena-scanned-bytes.js";

interface SimAthenaQueryOutcomeRequest {
  readonly execution: SimAthenaQueryExecution;
  readonly result: SimAthenaResolvedResult;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly catalog: SimAthenaCatalog | undefined;
  readonly objects: SimAthenaScannedObjects | undefined;
  readonly caller: SimAwsCaller | undefined;
  readonly now: Date;
}

/** Whether one query can answer, and what it read to find out. */
export interface SimAthenaQueryOutcome {
  readonly refusal: string | undefined;
  readonly bytesScanned: number;
}

/**
 * Work out whether a query answers, in the order real Athena reaches each
 * question.
 *
 * The query is planned, which resolves its tables and expands their partition
 * projection. What it reads is then measured. The cutoff is checked last,
 * against that figure.
 */
export async function simAthenaQueryOutcome(
  request: SimAthenaQueryOutcomeRequest,
): Promise<SimAthenaQueryOutcome> {
  const declared = request.result.declaredBytesScanned ?? 0;
  const plan = simAthenaPlanQuery(request);

  if (plan.refusal !== undefined) {
    return { refusal: plan.refusal, bytesScanned: declared };
  }

  const scanned = await simAthenaQueryScan({
    prefixes: plan.prefixes,
    result: request.result,
    objects: request.objects,
    caller: request.caller,
  });

  if (typeof scanned === "string") {
    return { refusal: scanned, bytesScanned: declared };
  }

  return {
    refusal: simAthenaCutoffRefusal(
      request.execution,
      scanned,
      request.workGroups,
    ),
    bytesScanned: scanned,
  };
}
