import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { SimDynamoDbConditionCheck } from "../item/sim-dynamodb-condition-check.js";
import type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.js";
import type { SimDynamoDbTransactPut } from "./transact.command.js";

/**
 * A put in a transaction, which replaces the whole item as PutItem does.
 */
class SimDynamoDbTransactPutAction implements SimDynamoDbTransactWrite {
  public readonly action = "dynamodb:PutItem";
  public readonly reference: string | undefined;

  private readonly item: SimDynamoDbItem;
  private readonly check: SimDynamoDbConditionCheck;

  constructor(
    reference: string | undefined,
    item: SimDynamoDbItem,
    check: SimDynamoDbConditionCheck,
  ) {
    this.reference = reference;
    this.item = item;
    this.check = check;
  }

  sizeInBytes(): number {
    return this.item.sizeInBytes();
  }

  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfItem(this.item);
  }

  assertApplicableTo(table: SimDynamoDbTable): void {
    this.check.assertHoldsFor(table.itemUnder(this.item));
  }

  applyTo(table: SimDynamoDbTable): void {
    table.putItem(this.item);
  }
}

/**
 * Read the Put one action of a transaction carries.
 */
export function readSimDynamoDbTransactPut(
  request: SimDynamoDbTransactPut,
): SimDynamoDbTransactWrite {
  if (request.Item === undefined) {
    throw new SimDynamoDbValidationException("A Put requires an Item");
  }

  return new SimDynamoDbTransactPutAction(
    request.TableName,
    SimDynamoDbItem.fromAttributeValues(request.Item),
    SimDynamoDbConditionCheck.read(request, "TransactWriteItems"),
  );
}
