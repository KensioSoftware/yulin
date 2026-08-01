import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import { SimDynamoDbUpdatePlan } from "../item/sim-dynamodb-update-plan.js";
import type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.js";
import type { SimDynamoDbTransactUpdate } from "./transact.command.js";

/**
 * An update in a transaction, which changes part of the item its Key names.
 */
class SimDynamoDbTransactUpdateAction implements SimDynamoDbTransactWrite {
  public readonly action = "dynamodb:UpdateItem";
  public readonly reference: string | undefined;

  private readonly key: SimDynamoDbItem;
  private readonly plan: SimDynamoDbUpdatePlan;

  constructor(
    reference: string | undefined,
    key: SimDynamoDbItem,
    plan: SimDynamoDbUpdatePlan,
  ) {
    this.reference = reference;
    this.key = key;
    this.plan = plan;
  }

  sizeInBytes(): number {
    return this.key.sizeInBytes();
  }

  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfKey(this.key);
  }

  assertApplicableTo(table: SimDynamoDbTable): void {
    this.plan.check.assertHoldsFor(table.getItem(this.key));
    this.plan.assertLeavesKeyAlone(table.keySchema.attributeNames());
  }

  applyTo(table: SimDynamoDbTable): void {
    table.putItem(this.plan.applyTo(table.getItem(this.key), this.key));
  }
}

/**
 * Read the Update one action of a transaction carries.
 *
 * A transactional update names its UpdateExpression, where UpdateItem takes a
 * request without one as an upsert of the Key.
 */
export function readSimDynamoDbTransactUpdate(
  request: SimDynamoDbTransactUpdate,
): SimDynamoDbTransactWrite {
  if (request.UpdateExpression === undefined) {
    throw new SimDynamoDbValidationException(
      "An Update requires an UpdateExpression, since a transaction has no " +
        "upsert of a Key on its own",
    );
  }

  return new SimDynamoDbTransactUpdateAction(
    request.TableName,
    readSimDynamoDbKey(request.Key),
    SimDynamoDbUpdatePlan.read(request, "TransactWriteItems"),
  );
}
