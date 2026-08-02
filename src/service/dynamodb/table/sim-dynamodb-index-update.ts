import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import { readSimDynamoDbIndexName } from "../secondary-index/sim-dynamodb-index-name.js";

interface SimDynamoDbIndexUpdateProperties {
  readonly created: SimDynamoDbSecondaryIndexInput | undefined;
  readonly deletedName: string | undefined;
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
 * Refuse the throughput change to an existing index that is not simulated.
 *
 * A per-index capacity is read and reported here but enforces nothing, so
 * changing one would move a number that nothing acts on. It is refused rather
 * than applied, so a test cannot come to rely on a change this simulation does
 * not really make.
 */
function refuseIndexThroughputUpdate(
  entry: SimDynamoDbGlobalSecondaryIndexUpdateInput,
): void {
  if (entry.Update === undefined) {
    return;
  }

  throw new SimDynamoDbUnsupportedOperation(
    "Changing the provisioned capacity of an existing global secondary index " +
      "is not simulated, so UpdateTable refuses a GlobalSecondaryIndexUpdates " +
      "Update rather than reporting a capacity nothing here applies",
  );
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
 * most one of either. The entry is read but not resolved into an index here:
 * what an index is allowed to be depends on the table it is going onto, which
 * is where that is decided.
 */
export class SimDynamoDbIndexUpdate {
  public readonly created: SimDynamoDbSecondaryIndexInput | undefined;
  public readonly deletedName: string | undefined;

  private constructor(properties: SimDynamoDbIndexUpdateProperties) {
    this.created = properties.created;
    this.deletedName = properties.deletedName;
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
      refuseIndexThroughputUpdate(entry);
    }

    const created = entries
      .map((entry) => entry.Create)
      .filter((entry) => entry !== undefined);
    const deleted = entries
      .map((entry) => deletedIndexName(entry))
      .filter((name) => name !== undefined);

    if (created.length + deleted.length > 1) {
      throw new SimDynamoDbValidationException(
        "You can create or delete only one global secondary index per " +
          "UpdateTable operation",
      );
    }

    return new this({ created: created.at(0), deletedName: deleted.at(0) });
  }

  /**
   * Whether this asks for anything at all.
   */
  get isEmpty(): boolean {
    return this.created === undefined && this.deletedName === undefined;
  }
}
