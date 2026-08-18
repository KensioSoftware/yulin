/**
 * Reaching simulated DynamoDB with an ordinary SDK client over a port.
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

// A served request is authorized as whoever signed it, so the client needs
// credentials simulated IAM issued.
const simIam = simAws.iam();
await simIam.createUser(new CreateUserCommand({ UserName: "Widgets" }));
await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Widgets",
    PolicyName: "WriteWidgets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
    }),
  }),
);
const created = await simIam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Widgets" }),
);

const srv = await serveSimAws({ simAws, port: 8787 });

const client = new DynamoDBClient({
  region: simAws.defaultRegionName,
  endpoint: `http://localhost:${srv.port}`,
  credentials: {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  },
});

await client.send(
  new PutItemCommand({
    TableName: "widgets",
    Item: { id: { S: "w1" } },
  }),
);

await srv.close();
