import type { SimUpdateTableCommandInput } from "../../command/table/table.command.js";
import type { SimDynamoDbStreamSpecification } from "../../stream/sim-dynamodb-stream.types.js";
import { simCfnDynamoDbTableValueDiffers as differs } from "./sim-cfn-dynamodb-table-change.js";
import type { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

/**
 * The UpdateTable fields for the settings one definition of a table changes
 * against another.
 *
 * Each field is sent only where the template changed it, since DynamoDB
 * refuses a request asking for the state a table is already in. A setting the
 * new template leaves out goes back to the default CloudFormation creates a
 * table with.
 */
export function simCfnDynamoDbTableSettings(
  before: SimCfnDynamoDbTableProperties,
  after: SimCfnDynamoDbTableProperties,
  stream: SimDynamoDbStreamSpecification | undefined,
): Omit<SimUpdateTableCommandInput, "TableName"> {
  return {
    ...(differs(
      [before.billingMode(), before.provisionedThroughput()],
      [after.billingMode(), after.provisionedThroughput()],
    ) && {
      BillingMode: after.billingMode() ?? "PROVISIONED",
      ProvisionedThroughput: after.provisionedThroughput(),
    }),
    ...(differs(before.tableClass(), after.tableClass()) && {
      TableClass: after.tableClass() ?? "STANDARD",
    }),
    ...(differs(
      before.deletionProtectionEnabled(),
      after.deletionProtectionEnabled(),
    ) && {
      DeletionProtectionEnabled: after.deletionProtectionEnabled() ?? false,
    }),
    ...(stream !== undefined && { StreamSpecification: stream }),
  };
}
