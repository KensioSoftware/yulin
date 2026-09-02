import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaTableObjects } from "../engine/sim-athena-table-objects.js";
import type { SimAthenaQueryEngine } from "../engine/sim-athena-query-engine.js";
import { simAthenaStrictRefusal } from "../engine/sim-athena-turn-down.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaQueryResults } from "./sim-athena-query-results.js";
import type { SimAthenaResolvedResult } from "./sim-athena-resolved-result.js";

/** Which of the two things that can answer a query answered this one. */
export type SimAthenaAnswerSource = "engine" | "declaration";

/** One query's rows, and where they came from. */
export interface SimAthenaQueryAnswer {
  readonly result: SimAthenaResolvedResult;
  readonly source: SimAthenaAnswerSource;

  /**
   * Why the query fails rather than answering, where a strict engine turned it
   * down.
   *
   * The declared result is still carried alongside, because it is what the
   * query would have answered with had the engine not been strict.
   */
  readonly refusal: string | undefined;
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

  /** When the query started, which `current_timestamp` answers with. */
  readonly startedAt: Date;
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
 *
 * A strict engine is the exception, and it fails the query it turned down.
 * The declaration keeps its place ahead of that, since a test writing one
 * against this exact statement has already said what the engine gets wrong.
 */
export async function simAthenaQueryAnswer(
  request: SimAthenaQueryAnswerRequest,
): Promise<SimAthenaQueryAnswer> {
  const forQuery = request.results.declaredForQuery(request.queryString);

  if (forQuery !== undefined) {
    return { result: forQuery, source: "declaration", refusal: undefined };
  }

  const computed = await request.engine.run({
    queryString: request.queryString,
    tables: request.tables,
    sessionDatabase: request.sessionDatabase,
    objects: request.objects,
    caller: request.caller,
    startedAt: request.startedAt,
  });

  if (computed.result !== undefined) {
    return { result: computed.result, source: "engine", refusal: undefined };
  }

  return {
    result: request.declared,
    source: "declaration",
    refusal: strictRefusal(request.engine, computed.turnedDown),
  };
}

/**
 * Why a query fails, where a strict engine is what turned it down.
 *
 * An engine nobody turned on turns nothing down, and a lenient one turns a
 * query down without failing it. Both answer from the declaration.
 */
function strictRefusal(
  engine: SimAthenaQueryEngine,
  turnedDown: string | undefined,
): string | undefined {
  if (turnedDown === undefined || !engine.isStrict) {
    return undefined;
  }

  return simAthenaStrictRefusal(turnedDown);
}
