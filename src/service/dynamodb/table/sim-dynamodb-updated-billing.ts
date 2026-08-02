import type { SimUpdateTableCommandInput } from "../command/table/table.command.js";
import { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbUpdatableTable } from "./sim-dynamodb-updatable-table.js";

/**
 * Read the billing an UpdateTable request asks for, when it asks for one.
 *
 * A request carrying capacity and no `BillingMode` reprovisions the table under
 * the mode it already has, which is how an on-demand table asking for capacity
 * comes to be refused.
 *
 * A divergence: real DynamoDB lets a switch to `PROVISIONED` leave the capacity
 * out and estimates it from the last half hour of consumption. Nothing here
 * measures consumption, so an estimate would be a made-up number that a
 * deployment then reads back. The capacity has to be stated instead.
 */
export function readSimDynamoDbUpdatedBilling(
  input: SimUpdateTableCommandInput,
  table: SimDynamoDbUpdatableTable,
): SimDynamoDbTableBilling | undefined {
  if (
    input.BillingMode === undefined &&
    input.ProvisionedThroughput === undefined
  ) {
    return undefined;
  }

  if (input.BillingMode === undefined) {
    return table.billing.withThroughput(input.ProvisionedThroughput);
  }

  return SimDynamoDbTableBilling.fromInput(input);
}
