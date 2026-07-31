import { SimDynamoDbTable } from "../../../../dynamodb/table/sim-dynamodb-table.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimDynamoDbTableCfn } from "./sim-dynamodb-table-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated DynamoDB Resource.
 */
export function dynamoDbValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::DynamoDB::Table" &&
    properties.simResource instanceof SimDynamoDbTable
  ) {
    return new SimDynamoDbTableCfn({ table: properties.simResource });
  }

  return undefined;
}
