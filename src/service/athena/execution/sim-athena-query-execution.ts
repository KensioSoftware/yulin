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
 * The result it settles with is a declaration, matched on the query text. No
 * SQL is read to produce it.
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

  /** Finish the query with the rows it answered. */
  succeed(result: SimAthenaResolvedResult, completedAt: Date): void {
    if (this.#status.settle("SUCCEEDED", undefined, completedAt)) {
      this.#result = result;
    }
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
