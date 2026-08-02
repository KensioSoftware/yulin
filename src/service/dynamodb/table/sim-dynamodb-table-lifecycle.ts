import type { SimDynamoDbTableStatus } from "../command/table/table.types.js";
import {
  SimDynamoDbResourceInUseException,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import type { SimDynamoDbTableUpdate } from "./sim-dynamodb-table-update.js";

interface SimDynamoDbTableLifecycleProperties {
  readonly tableName: string;
  readonly deletionProtectionEnabled: boolean;
}

/**
 * The statuses a simulated table moves through.
 *
 * A table is CREATING when it is made and ACTIVE once the scheduled creation
 * has run. Deleting it takes it to DELETING, and the table is removed when the
 * scheduled deletion runs. What a request may do to a table depends on where it
 * is in that sequence, which is why the sequence is a thing of its own.
 */
export class SimDynamoDbTableLifecycle {
  private readonly tableName: string;
  #deletionProtectionEnabled: boolean;
  #status: SimDynamoDbTableStatus = "CREATING";

  constructor(properties: SimDynamoDbTableLifecycleProperties) {
    this.tableName = properties.tableName;
    this.#deletionProtectionEnabled = properties.deletionProtectionEnabled;
  }

  /**
   * Where the table is now.
   */
  get status(): SimDynamoDbTableStatus {
    return this.#status;
  }

  /**
   * Whether the table is protected from deletion.
   */
  get deletionProtectionEnabled(): boolean {
    return this.#deletionProtectionEnabled;
  }

  /**
   * Finish creating or updating the table.
   */
  activate(): void {
    this.#status = "ACTIVE";
  }

  /**
   * Start changing the table's definition.
   *
   * The table serves reads and writes throughout, since AWS does not take one
   * offline to update it. What UPDATING says is that another UpdateTable will
   * be refused until this one has finished.
   */
  beginUpdate(): void {
    this.#status = "UPDATING";
  }

  /**
   * Refuse an update the table is not in a state to take.
   *
   * Real DynamoDB takes one UpdateTable at a time: while a table is UPDATING,
   * a second request is refused rather than queued. A table that is still
   * being created has nothing to update yet.
   */
  assertUpdatable(): void {
    if (this.#status !== "ACTIVE") {
      throw new SimDynamoDbResourceInUseException(
        `Table ${this.tableName} is ${this.#status} and cannot be updated ` +
          `until it is ACTIVE`,
      );
    }
  }

  /**
   * Take the part of an UpdateTable that moves the table's status.
   *
   * Deletion protection belongs here because it is what `assertDeletable`
   * reads, so the two stay in one place rather than being kept in step.
   */
  applyUpdate(update: SimDynamoDbTableUpdate): void {
    if (update.deletionProtectionEnabled !== undefined) {
      this.#deletionProtectionEnabled = update.deletionProtectionEnabled;
    }

    this.beginUpdate();
  }

  /**
   * Start deleting the table.
   */
  beginDeletion(): void {
    this.#status = "DELETING";
  }

  /**
   * Refuse a delete the table is not in a state to take.
   *
   * Deletion protection is checked first, as real DynamoDB checks it, so a
   * protected table stays as it was rather than being taken part way through.
   */
  assertDeletable(): void {
    if (this.#deletionProtectionEnabled) {
      throw new SimDynamoDbValidationException(
        `Table ${this.tableName} cannot be deleted while DeletionProtection ` +
          `is enabled`,
      );
    }

    if (this.#status === "CREATING" || this.#status === "UPDATING") {
      throw new SimDynamoDbResourceInUseException(
        `Table ${this.tableName} is ${this.#status} and cannot be deleted ` +
          `until it is ACTIVE`,
      );
    }
  }
}
