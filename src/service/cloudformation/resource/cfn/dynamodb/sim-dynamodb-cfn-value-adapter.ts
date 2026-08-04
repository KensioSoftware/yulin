import {
  dynamoDbGlobalTableResourceTypeName,
  dynamoDbTableResourceTypeName,
} from "../../../../dynamodb/cfn/sim-cfn-dynamodb-resource-type.js";
import { SimDynamoDbTable } from "../../../../dynamodb/table/sim-dynamodb-table.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimDynamoDbTableCfn } from "./sim-dynamodb-table-cfn.js";

/**
 * The Resource types that deploy a simulated table.
 */
const tableResourceTypeNames: ReadonlySet<string> = new Set([
  dynamoDbTableResourceTypeName,
  dynamoDbGlobalTableResourceTypeName,
]);

/**
 * The CloudFormation-facing value adapter for a simulated DynamoDB Resource.
 *
 * A global table with one replica deploys the same simulated table an ordinary
 * one does, so both Resource types answer through the same adapter, which is
 * told which of them it is speaking for.
 */
export function dynamoDbValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type } = properties;

  if (
    type !== undefined &&
    tableResourceTypeNames.has(type) &&
    properties.simResource instanceof SimDynamoDbTable
  ) {
    return new SimDynamoDbTableCfn({
      table: properties.simResource,
      resourceTypeName: type,
    });
  }

  return undefined;
}
