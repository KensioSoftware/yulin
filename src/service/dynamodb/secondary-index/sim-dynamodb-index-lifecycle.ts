import type { SimDynamoDbIndexStatus } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

interface SimDynamoDbIndexLifecycleProperties {
  readonly indexName: string;
  readonly backfills: boolean;
}

/**
 * Where one global secondary index is between being declared and being read.
 *
 * An index is CREATING until the work that builds it has run, and cannot be
 * read until it is ACTIVE. An index added to a table that already holds items
 * also backfills, which is DynamoDB copying those items into it, and that is
 * what `Backfilling` reports. An index declared on CreateTable has nothing to
 * copy, so real DynamoDB leaves `Backfilling` out of its description
 * altogether.
 */
export class SimDynamoDbIndexLifecycle {
  private readonly indexName: string;
  private readonly backfills: boolean;
  #status: SimDynamoDbIndexStatus = "CREATING";

  constructor(properties: SimDynamoDbIndexLifecycleProperties) {
    this.indexName = properties.indexName;
    this.backfills = properties.backfills;
  }

  /**
   * The lifecycle of an index declared on CreateTable, which does not backfill.
   */
  static withTable(indexName: string): SimDynamoDbIndexLifecycle {
    return new this({ indexName, backfills: false });
  }

  /**
   * The lifecycle of an index added to a live table, which backfills.
   */
  static backfilling(indexName: string): SimDynamoDbIndexLifecycle {
    return new this({ indexName, backfills: true });
  }

  /**
   * Where the index is now.
   */
  get status(): SimDynamoDbIndexStatus {
    return this.#status;
  }

  /**
   * Whether the index is being filled with the items already on the table.
   *
   * Reported only while that is happening, which is how real DynamoDB reports
   * it: an index that never backfilled has no `Backfilling` in its description.
   */
  get backfilling(): boolean | undefined {
    if (!this.backfills || this.#status !== "CREATING") {
      return undefined;
    }

    return true;
  }

  /**
   * Finish building the index.
   */
  activate(): void {
    this.#status = "ACTIVE";
  }

  /**
   * Refuse a read of an index that is not ready to answer one.
   *
   * Real DynamoDB refuses a Query or a Scan against an index it is still
   * building, rather than answering with the part of it that is filled in. An
   * application that reads a new index too early gets this rather than a short
   * answer, which is the whole point of the index having a status.
   */
  assertReadable(): void {
    if (this.#status === "ACTIVE") {
      return;
    }

    throw new SimDynamoDbValidationException(
      `Cannot read from backfilling global secondary index: ${this.indexName}`,
    );
  }
}
