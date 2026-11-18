import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbIndexName } from "../secondary-index/sim-dynamodb-index-name.js";
import {
  type SimDynamoDbIndexThroughputUpdate,
  readSimDynamoDbIndexThroughputUpdates,
} from "./sim-dynamodb-index-throughput-update.js";

interface SimDynamoDbIndexUpdateProperties {
  readonly created: SimDynamoDbSecondaryIndexInput | undefined;
  readonly deletedName: string | undefined;
  readonly updated: readonly SimDynamoDbIndexThroughputUpdate[];
}

/**
 * Refuse an entry that does not name exactly one thing to do.
 *
 * One `GlobalSecondaryIndexUpdates` entry is one action. An entry carrying two
 * of them does not say which was meant, and one carrying none asks for nothing.
 */
function assertOneAction(
  entry: SimDynamoDbGlobalSecondaryIndexUpdateInput,
): void {
  const actions = [entry.Create, entry.Delete, entry.Update].filter(
    (action) => action !== undefined,
  );

  if (actions.length !== 1) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: a " +
        "GlobalSecondaryIndexUpdates entry names exactly one of Create, " +
        "Delete or Update",
    );
  }
}

/**
 * The index name a `Delete` entry names.
 *
 * It is read the way an index name is read everywhere else, so a name DynamoDB
 * would refuse is refused here rather than looked up and not found.
 */
function deletedIndexName(
  entry: SimDynamoDbGlobalSecondaryIndexUpdateInput,
): string | undefined {
  if (entry.Delete === undefined) {
    return undefined;
  }

  return readSimDynamoDbIndexName(entry.Delete.IndexName);
}

/**
 * What an UpdateTable request asks to do to a table's global secondary indexes.
 *
 * AWS takes one index creation or one index deletion per call, so this holds at
 * most one of either. Capacity changes are a third kind of call, and one call
 * can change the capacity of any number of indexes. The entry is read but not resolved into an index here:
 * what an index is allowed to be depends on the table it is going onto, which
 * is where that is decided.
 */
export class SimDynamoDbIndexUpdate {
  public readonly created: SimDynamoDbSecondaryIndexInput | undefined;
  public readonly deletedName: string | undefined;

  /** The indexes whose capacity the request changes. */
  public readonly updated: readonly SimDynamoDbIndexThroughputUpdate[];

  private constructor(properties: SimDynamoDbIndexUpdateProperties) {
    this.created = properties.created;
    this.deletedName = properties.deletedName;
    this.updated = properties.updated;
  }

  /**
   * Read the `GlobalSecondaryIndexUpdates` an UpdateTable request carries.
   */
  static fromInput(
    input: readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[] | undefined,
  ): SimDynamoDbIndexUpdate {
    const entries = input ?? [];

    for (const entry of entries) {
      assertOneAction(entry);
    }

    const created = entries
      .map((entry) => entry.Create)
      .filter((entry) => entry !== undefined);
    const deleted = entries
      .map((entry) => deletedIndexName(entry))
      .filter((name) => name !== undefined);

    if (created.length + deleted.length > 1) {
      throw new SimDynamoDbValidationException(
        "Cannot perform more than one GSI creation or deletion in a single update",
      );
    }

    const updated = readSimDynamoDbIndexThroughputUpdates(entries);

    if (created.length + deleted.length > 0 && updated.length > 0) {
      throw new SimDynamoDbValidationException(
        "One or more parameter values were invalid: UpdateTable does one thing " +
          "at a time, and this request changes the capacity of a global " +
          "secondary index while creating or deleting one",
      );
    }

    return new this({
      created: created.at(0),
      deletedName: deleted.at(0),
      updated,
    });
  }

  /**
   * Whether this creates or deletes nothing.
   */
  get isEmpty(): boolean {
    return this.created === undefined && this.deletedName === undefined;
  }
}
