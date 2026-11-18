import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamPolicyDocumentCondition } from "../../../iam/policy/sim-iam-policy.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";

/**
 * The table a condition key test reads and writes.
 */
export const simDynamoDbConditionKeyTable = "OrdersTable";

/**
 * A key the stocked table holds an item under.
 */
export const simDynamoDbConditionKeyItem = {
  customerId: { S: "c-1" },
  orderId: { S: "2026-01" },
};

/**
 * A stocked table, and a caller allowed the item actions on it under one
 * condition.
 */
export async function simDynamoDbCallerUnder(
  condition: SimIamPolicyDocumentCondition,
): Promise<{ readonly simAws: SimAws; readonly caller: SimAwsCaller }> {
  const simAws = new SimAws();
  await simDynamoDbStockedTableFactory.make(
    { tableName: simDynamoDbConditionKeyTable },
    simAws,
  );
  const role = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "ConditionedRole",
      actions: [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
      ],
      condition,
    },
    simAws,
  );

  return { simAws, caller: { kind: "arn", arn: role.Arn } };
}
