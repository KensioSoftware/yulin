import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import { assertSimDynamoDbTransactItemCount } from "./sim-dynamodb-transact-items.js";
import type {
  SimDynamoDbItemResponse,
  SimDynamoDbTransactGet,
  SimDynamoDbTransactGetItem,
} from "./transact.command.js";

const operation = "TransactGetItems";

/**
 * One Get of a transactional read.
 *
 * A transactional read is always strongly consistent, so there is no
 * `ConsistentRead` to settle: every Get reads the latest item under its key.
 */
export class SimDynamoDbTransactRead {
  public readonly action = "dynamodb:GetItem";
  public readonly reference: string | undefined;

  private readonly key: SimDynamoDbItem;
  private readonly projection: SimDynamoDbProjection | undefined;

  private constructor(
    reference: string | undefined,
    key: SimDynamoDbItem,
    projection: SimDynamoDbProjection | undefined,
  ) {
    this.reference = reference;
    this.key = key;
    this.projection = projection;
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

    return { Item: (this.projection?.apply(item) ?? item).toAttributeValues() };
  }
}

/**
 * Read every Get a transactional read asks for, before any table is reached.
 *
 * A ProjectionExpression DynamoDB would refuse is refused whether or not the
 * keys hold anything, which is how the other reads work too.
 */
export function readSimDynamoDbTransactGets(
  items: readonly SimDynamoDbTransactGetItem[] | undefined,
): readonly SimDynamoDbTransactRead[] {
  const requested = items ?? [];

  assertSimDynamoDbTransactItemCount(requested.length, operation);

  return requested.map((item) => readGet(item));
}

/**
 * Read one entry of a transactional read.
 *
 * A TransactGetItem carries a Get and nothing else, so an entry without one is
 * refused rather than read as an empty request.
 */
function readGet(item: SimDynamoDbTransactGetItem): SimDynamoDbTransactRead {
  if (item.Get === undefined) {
    throw new SimDynamoDbValidationException(
      "A TransactGetItem carries a Get, and this one carries none",
    );
  }

  return SimDynamoDbTransactRead.of(item.Get);
}
