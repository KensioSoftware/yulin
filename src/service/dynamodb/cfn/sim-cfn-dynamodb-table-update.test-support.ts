import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnDynamoDbTableResourceFactory } from "./table/sim-cfn-dynamodb-table-resource.factory.js";

/**
 * The orders table a template declares, with the properties given on top.
 */
export function ordersTable(
  properties: SimCfnTemplateValueRecord = {},
): SimCfnTemplateValueRecord {
  return simCfnDynamoDbTableResourceFactory.make({
    tableName: "orders",
    partitionKeyName: "orderId",
    properties,
  });
}

/**
 * Deploy the orders table and put one order in it.
 */
export async function deployWithOrder(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord = {},
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: { Resources: { OrdersTable: ordersTable(properties) } },
  });
  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  await simAws.dynamoDb().putItem({
    input: {
      TableName: "orders",
      Item: { orderId: { S: "order-1" }, status: { S: "open" } },
    },
  });
}

/**
 * Update the stack to declare the orders table with the properties given.
 */
export async function updateOrdersTable(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<void> {
  const cloudFormation = simAws.cloudFormation();
  const template = { Resources: { OrdersTable: ordersTable(properties) } };

  await cloudFormation.updateStack({
    input: { StackName: "orders-stack", TemplateBody: jsonStringify(template) },
  });
  await cloudFormation.waitForStackUpdateComplete("orders-stack");
  await simAws.backgroundTasksComplete();
}

/**
 * The order the table holds, if it still holds it.
 */
export async function storedStatus(
  simAws: SimAws,
): Promise<string | undefined> {
  const stored = await simAws.dynamoDb().getItem({
    input: { TableName: "orders", Key: { orderId: { S: "order-1" } } },
  });

  return stored.Item?.["status"]?.S;
}
