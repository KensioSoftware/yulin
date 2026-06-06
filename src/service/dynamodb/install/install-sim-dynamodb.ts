import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsServiceMap } from "../../aws/sim-aws-services.js";
import { SimDynamoDb } from "../sim-dynamodb.js";

export { SimDynamoDb } from "../sim-dynamodb.js";

export interface SimDynamoDbServices {
  dynamoDb: SimDynamoDb;
}

/**
 * Install simulated DynamoDB into a simulated AWS environment.
 */
export function installSimDynamoDb<TServices extends SimAwsServiceMap>(
  simAws: SimAws<TServices>,
): asserts simAws is SimAws<TServices & SimDynamoDbServices> {
  simAws.installService("dynamoDb", (scope) => {
    return new SimDynamoDb(scope.accountRegionScope, simAws.background);
  });
}
