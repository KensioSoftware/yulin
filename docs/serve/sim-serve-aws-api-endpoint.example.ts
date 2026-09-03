/**
 * Calling simulated DynamoDB through a local HTTP endpoint.
 */

import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "widgets",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

const iam = simAws.iam();
await iam.createUser(new CreateUserCommand({ UserName: "Operator" }));
await iam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Operator",
    PolicyName: "WriteWidgets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource: "*",
      },
    }),
  }),
);
const created = await iam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Operator" }),
);

const server = await serveSimAws({ simAws });
const client = new DynamoDBClient({
  region: simAws.defaultRegionName,
  endpoint: `http://localhost:${server.port}`,
  credentials: {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  },
});

await client.send(
  new PutItemCommand({
    TableName: "widgets",
    Item: { id: { S: "widget-1" } },
  }),
);

await server.close();
