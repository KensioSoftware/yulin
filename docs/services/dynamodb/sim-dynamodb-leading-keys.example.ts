import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const region = simAws.defaultRegionName;

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

const roleCreation = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "CustomerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "CustomerRole",
    PolicyName: "OwnItemsOnly",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource: `arn:aws:dynamodb:${region}:${accountId}:table/OrdersTable`,
        Condition: {
          "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["c-1"] },
        },
      },
    }),
  }),
);

const caller = { kind: "arn", arn: roleCreation.Role.Arn } as const;

// The customer's own item is written.
await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { customerId: { S: "c-1" }, total: { N: "25" } },
  }),
  { caller },
);

// Another customer's item is refused.
try {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-2" }, total: { N: "25" } },
    }),
    { caller },
  );
} catch (error) {
  console.log(error instanceof Error ? error.name : "unknown error");
  // "AccessDenied"
}
