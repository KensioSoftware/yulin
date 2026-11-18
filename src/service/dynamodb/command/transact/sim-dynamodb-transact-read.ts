import type { SimDynamoDbProjectionRead } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import { readSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import type { SimDynamoDbTableReach } from "../table/sim-dynamodb-table-reach.js";
import { simDynamoDbTransactGetReach } from "./sim-dynamodb-transact-reach.js";
import type {
  SimDynamoDbItemResponse,
  SimDynamoDbTransactGet,
} from "./transact.command.js";

/**
 * One Get of a transactional read.
 *
 * A transactional read is always strongly consistent, so there is no
 * `ConsistentRead` to settle: every Get reads the latest item under its key.
 */
export class SimDynamoDbTransactRead {
  public readonly action = "dynamodb:GetItem";
  public readonly reference: string | undefined;

  public readonly key: SimDynamoDbItem;
  private readonly read: SimDynamoDbProjectionRead;

  private constructor(
    reference: string | undefined,
    key: SimDynamoDbItem,
    read: SimDynamoDbProjectionRead,
  ) {
    this.reference = reference;
    this.key = key;
    this.read = read;
  }

  /**
   * Read the Get one action of a transactional read carries.
   */
  static of(request: SimDynamoDbTransactGet): SimDynamoDbTransactRead {
    return new this(
      request.TableName,
      readSimDynamoDbKey(request.Key),
      readSimDynamoDbProjection(request),
    );
  }

  /**
   * What this Get reaches, for the condition keys it is authorized with as a
   * `GetItem`.
   */
  reach(): SimDynamoDbTableReach {
    return simDynamoDbTransactGetReach(this.key, this.read);
  }

  /**
   * The primary key this Get reads, as the table marshals it.
   */
  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfKey(this.key);
  }

  /**
   * Read this Get's item, as the table it is in and the projection asked for
   * it.
   *
   * A key holding nothing answers with an entry carrying no `Item`, rather than
   * with nothing at all, so the answers line up with the Gets that asked for
   * them.
   */
  readFrom(table: SimDynamoDbTable): SimDynamoDbItemResponse {
    const item = table.getItem(this.key);

    if (item === undefined) {
      return {};
    }

    return {
      Item: (this.read.projection?.apply(item) ?? item).toAttributeValues(),
    };
  }
}
