import type { SimDynamoDbProvisionedThroughput } from "../../command/table/table.types.js";
import type { SimCfnDynamoDbTableValues } from "./sim-cfn-dynamodb-table-values.js";

/**
 * Read the capacity a `ProvisionedThroughput` property asks for.
 *
 * A table and each of its global secondary indexes are provisioned separately
 * and state it the same way, so both are read here rather than each carrying a
 * copy of the shape.
 */
export function readSimCfnDynamoDbThroughput(
  values: SimCfnDynamoDbTableValues,
): SimDynamoDbProvisionedThroughput | undefined {
  const throughput = values.object("ProvisionedThroughput");

  if (throughput === undefined) {
    return undefined;
  }

  return {
    ReadCapacityUnits: throughput.number("ReadCapacityUnits"),
    WriteCapacityUnits: throughput.number("WriteCapacityUnits"),
  };
}
