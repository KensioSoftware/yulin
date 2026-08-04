import type { SimDynamoDbKeySchemaElementInput } from "../../command/table/table.types.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

/**
 * Read the `KeySchema` property of a table or one of its secondary indexes.
 *
 * A table and an index state their keys the same way, so both are read here.
 * The elements are kept in the order the template lists them, since that is
 * what says which is the partition key.
 */
export function readSimCfnDynamoDbKeySchema(
  values: SimCfnDynamoDbPropertyValues,
): readonly SimDynamoDbKeySchemaElementInput[] {
  return values.list("KeySchema").map((element) => {
    return {
      AttributeName: element.string("AttributeName"),
      KeyType: element.string("KeyType"),
    };
  });
}
