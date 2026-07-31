import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimUpdateItemCommand,
  SimUpdateItemCommandOutput,
} from "./item.command.js";
import { readSimDynamoDbKey } from "./sim-dynamodb-key-input.js";
import { SimDynamoDbReturnValues } from "./sim-dynamodb-return-values.js";
import { refuseUnsimulatedItemUpdateInput } from "./sim-dynamodb-unsimulated-item-update-input.js";
import { SimDynamoDbUpdateAnswer } from "./sim-dynamodb-update-answer.js";
import { SimDynamoDbUpdatePlan } from "./sim-dynamodb-update-plan.js";

interface SimDynamoDbUpdateItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbUpdateItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The UpdateItem command.
 *
 * UpdateItem changes part of an item rather than replacing it, which is what
 * makes it different from PutItem. It upserts: a key holding nothing gets an
 * item built from the Key and whatever the update sets.
 *
 * Every action of the update expression reads the item as it stood before the
 * request, rather than the item being built, so the actions of one expression
 * do not see each other's work.
 */
export class SimDynamoDbUpdateItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbUpdateItemProperties) {
    this.access = properties.access;
  }

  /**
   * Change an item, and answer with the item before or after it when asked to.
   */
  handle(
    command: SimUpdateItemCommand,
    options?: SimDynamoDbUpdateItemOptions,
  ): SimUpdateItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedItemUpdateInput(input);

    // The expressions are read before the table is reached, so one DynamoDB
    // would refuse is refused whether or not the key holds anything.
    const plan = SimDynamoDbUpdatePlan.read(input, "UpdateItem");
    const table = this.access.required(
      "dynamodb:UpdateItem",
      input.TableName,
      options?.caller,
    );
    const asked = SimDynamoDbReturnValues.readForUpdate(
      input.ReturnValues,
      "UpdateItem",
    );
    const key = readSimDynamoDbKey(input.Key);
    const existing = table.getItem(key);

    plan.check.assertHoldsFor(existing);
    plan.assertLeavesKeyAlone(table.keySchema.attributeNames());

    const updated = plan.applyTo(existing, key);
    table.putItem(updated);

    return new SimDynamoDbUpdateAnswer({
      asked,
      touched: plan.touched(),
    }).of(existing, updated);
  }
}
