import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaTableObjects } from "../engine/sim-athena-table-objects.js";
import type { SimAthenaQueryEngine } from "../engine/sim-athena-query-engine.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaQueryResults } from "./sim-athena-query-results.js";
import type { SimAthenaResolvedResult } from "./sim-athena-resolved-result.js";

/** Which of the two things that can answer a query answered this one. */
export type SimAthenaAnswerSource = "engine" | "declaration";

/** One query's rows, and where they came from. */
export interface SimAthenaQueryAnswer {
  readonly result: SimAthenaResolvedResult;
  readonly source: SimAthenaAnswerSource;
}

interface SimAthenaQueryAnswerRequest {
  readonly queryString: string;
  readonly sessionDatabase: string | undefined;

  /** What the declarations answer this query with, default included. */
  readonly declared: SimAthenaResolvedResult;

  readonly results: SimAthenaQueryResults;
  readonly engine: SimAthenaQueryEngine;
  readonly tables: readonly SimAthenaPlannedTable[];
  readonly objects: SimAthenaTableObjects | undefined;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * What one query answers with, from the engine or from a declaration.
 *
 * A declaration written against this exact query text wins. That is a test
 * saying what this one statement answers, which is more specific than anything
 * the engine can work out and is the escape hatch for a query the engine
 * cannot run correctly.
 *
 * The engine comes next, and a query it turns down falls back to the
 * declarations again, where a workgroup rule or the default answers it. Every
 * test written before the engine existed therefore keeps working, whether or
 * not the engine is on.
 */
export async function simAthenaQueryAnswer(
  request: SimAthenaQueryAnswerRequest,
): Promise<SimAthenaQueryAnswer> {
  const forQuery = request.results.declaredForQuery(request.queryString);

  if (forQuery !== undefined) {
    return { result: forQuery, source: "declaration" };
  }

  const computed = await request.engine.run({
    queryString: request.queryString,
    tables: request.tables,
    sessionDatabase: request.sessionDatabase,
    objects: request.objects,
    caller: request.caller,
  });

  return computed === undefined
    ? { result: request.declared, source: "declaration" }
    : { result: computed, source: "engine" };
}
