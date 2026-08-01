import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import { readSimDynamoDbTransactGets } from "./sim-dynamodb-transact-gets.js";
import { reachSimDynamoDbTransactTables } from "./sim-dynamodb-transact-tables.js";
import { refuseUnsimulatedTransactGetInput } from "./sim-dynamodb-unsimulated-transact-input.js";
import type {
  SimTransactGetItemsCommand,
  SimTransactGetItemsCommandOutput,
} from "./transact.command.js";

interface SimDynamoDbTransactGetItemsProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbTransactGetItemsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The TransactGetItems command.
 *
 * A transactional read reads items by primary key across tables in one call,
 * and always reads them strongly consistently, so there is no `ConsistentRead`
 * to set.
 *
 * `Responses` is positional and is never compacted: there is one entry per Get,
 * in the order the Gets were named, and a key that holds nothing gives an entry
 * with no `Item`. That is what makes a transactional read different from a
 * batch read, which leaves a missing item out altogether.
 */
export class SimDynamoDbTransactGetItems {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbTransactGetItemsProperties) {
    this.access = properties.access;
  }

  /**
   * Read every item a transaction asks for.
   */
  handle(
    command: SimTransactGetItemsCommand,
    options?: SimDynamoDbTransactGetItemsOptions,
  ): SimTransactGetItemsCommandOutput {
    const input = command.input;

    refuseUnsimulatedTransactGetInput(input);

    const targets = reachSimDynamoDbTransactTables(
      readSimDynamoDbTransactGets(input.TransactItems),
      { access: this.access, caller: options?.caller },
    );

    return {
      Responses: targets.map(({ item, table }) => item.readFrom(table)),
      $metadata: {},
    };
  }
}
