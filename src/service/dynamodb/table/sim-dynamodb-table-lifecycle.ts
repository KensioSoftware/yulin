import type { SimDynamoDbTableStatus } from "../command/table/table.types.js";
import {
  SimDynamoDbResourceInUseException,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";

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
  private readonly deletionProtectionEnabled: boolean;
  #status: SimDynamoDbTableStatus = "CREATING";

  constructor(properties: SimDynamoDbTableLifecycleProperties) {
    this.tableName = properties.tableName;
    this.deletionProtectionEnabled = properties.deletionProtectionEnabled;
  }

  /**
   * Where the table is now.
   */
  get status(): SimDynamoDbTableStatus {
    return this.#status;
  }

  /**
   * Finish creating the table.
   */
  activate(): void {
    this.#status = "ACTIVE";
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
    if (this.deletionProtectionEnabled) {
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
