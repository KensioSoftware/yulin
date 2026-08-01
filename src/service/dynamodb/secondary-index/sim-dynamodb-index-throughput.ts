import type { SimDynamoDbSecondaryIndexInput } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbTableBilling } from "../table/sim-dynamodb-table-billing.js";
import { SimDynamoDbTableThroughput } from "../table/sim-dynamodb-table-throughput.js";

/**
 * Read the capacity a secondary index is provisioned with.
 *
 * A global secondary index is provisioned separately from the table it belongs
 * to, so a provisioned table needs a throughput per index as well as its own.
 * An on-demand table has nothing to provision, and the two contradict each
 * other in both directions the same way the table's own do.
 */
export function readSimDynamoDbIndexThroughput(
  input: SimDynamoDbSecondaryIndexInput,
  indexName: string,
  billing: SimDynamoDbTableBilling,
): SimDynamoDbTableThroughput {
  if (billing.mode === "PROVISIONED") {
    if (input.ProvisionedThroughput === undefined) {
      throw new SimDynamoDbValidationException(
        `One or more parameter values were invalid: ProvisionedThroughput ` +
          `must be specified for index: ${indexName} when BillingMode is ` +
          `PROVISIONED`,
      );
    }

    return SimDynamoDbTableThroughput.required(input.ProvisionedThroughput);
  }

  if (input.ProvisionedThroughput !== undefined) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ProvisionedThroughput ` +
        `cannot be specified for index: ${indexName} when BillingMode is ` +
        `PAY_PER_REQUEST`,
    );
  }

  return SimDynamoDbTableThroughput.none();
}
