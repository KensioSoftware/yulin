import type { SimAthenaAnswerSource } from "../result/sim-athena-query-answer.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import type { SimAthenaQueryState } from "./sim-athena-query-state.js";
import { SimAthenaQueryStatus } from "./sim-athena-query-status.js";

interface SimAthenaQueryExecutionProperties {
  readonly queryExecutionId: string;
  readonly queryString: string;
  readonly workGroupName: string;
  readonly outputLocation: string;
  readonly submittedAt: Date;
  readonly database?: string | undefined;
  readonly catalog?: string | undefined;
}

/**
 * One simulated Athena query execution.
 *
 * A query is the one thing here that changes over time, so this is held
 * mutably and moved through its states by `SimAthenaQueryRunner`. Everything
 * else in simulated Athena is replaced rather than mutated.
 *
 * The result it settles with comes either from the query engine or from a
 * declaration matched on the query text, and `answeredBy` says which.
 */
export class SimAthenaQueryExecution {
  public readonly queryExecutionId: string;
  public readonly queryString: string;
  public readonly workGroupName: string;
  public readonly outputLocation: string;
  public readonly submittedAt: Date;
  public readonly database: string | undefined;
  public readonly catalog: string | undefined;

  readonly #status = new SimAthenaQueryStatus();
  #bytesScanned = 0;
  #result: SimAthenaResolvedResult | undefined;
  #answeredBy: SimAthenaAnswerSource | undefined;

  constructor(properties: SimAthenaQueryExecutionProperties) {
    this.queryExecutionId = properties.queryExecutionId;
    this.queryString = properties.queryString;
    this.workGroupName = properties.workGroupName;
    this.outputLocation = properties.outputLocation;
    this.submittedAt = properties.submittedAt;
    this.database = properties.database;
    this.catalog = properties.catalog;
  }

  get state(): SimAthenaQueryState {
    return this.#status.state;
  }

  get stateChangeReason(): string | undefined {
    return this.#status.stateChangeReason;
  }

  get completedAt(): Date | undefined {
    return this.#status.completedAt;
  }

  /**
   * How many bytes the query scanned.
   *
   * Reported whichever way the query ended, because a caller counting the cost
   * of a query that failed still wants it.
   */
  get bytesScanned(): number {
    return this.#bytesScanned;
  }

  /** The rows this query answered with, once it has succeeded. */
  get result(): SimAthenaResolvedResult | undefined {
    return this.#result;
  }

  /**
   * Whether the query engine or a declaration answered this query.
   *
   * A test that turned the engine on reads this to prove it got the engine,
   * since rows a declaration happens to agree with look the same either way.
   */
  get answeredBy(): SimAthenaAnswerSource | undefined {
    return this.#answeredBy;
  }

  /** Whether this query has finished. */
  get isSettled(): boolean {
    return this.#status.isSettled;
  }

  /** Move the query from queued to running. */
  start(): void {
    this.#status.start();
  }

  /** Record what the query scanned, whether or not it goes on to succeed. */
  recordBytesScanned(bytesScanned: number): void {
    this.#bytesScanned = bytesScanned;
  }

  /** Finish the query with the rows it answered, and what answered it. */
  succeed(
    result: SimAthenaResolvedResult,
    answeredBy: SimAthenaAnswerSource,
    completedAt: Date,
  ): void {
    if (!this.#status.settle("SUCCEEDED", undefined, completedAt)) {
      return;
    }

    this.#result = result;
    this.#answeredBy = answeredBy;
  }

  /** Finish the query without an answer, saying why. */
  fail(reason: string, completedAt: Date): void {
    this.#status.settle("FAILED", reason, completedAt);
  }

  /** Give up on a query a caller stopped. */
  cancel(completedAt: Date): void {
    this.#status.settle("CANCELLED", "Query cancelled by user", completedAt);
  }
}
