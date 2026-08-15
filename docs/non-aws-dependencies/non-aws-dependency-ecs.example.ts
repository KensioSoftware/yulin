/**
 * A simulated ECS container writing to a simulated DynamoDB table and reading
 * from a cache of its own.
 */

import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimSdk } from "@kensio/yulin/sdk";

/**
 * Where the worker reads exchange rates from.
 *
 * A deployment builds a Redis client from the URL. This example stands one in,
 * so nothing has to be running for it to work.
 */
class RateCache {
  constructor(private readonly url: string) {}

  rate(currency: string): Promise<string> {
    console.log(`reading ${currency} from ${this.url}`);
    // reading GBP from redis://127.0.0.1:6379
    return Promise.resolve("1.27");
  }
}

using simSdk = new SimSdk();
const { simAws } = simSdk;
const ecs = simAws.ecs();

simSdk.intercept(DynamoDBClient);

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "rates",
    KeySchema: [{ AttributeName: "currency", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "currency", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

const taskRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "RatesTaskRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "RatesTaskRole",
    PolicyName: "WriteRates",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource:
          `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
          `${simAws.defaultAccountId}:table/rates`,
      },
    }),
  }),
);

await ecs.createCluster(new CreateClusterCommand({}));

ecs.bindContainer({
  family: "rates-worker",
  containerName: "app",
  run: async () => {
    // Both reads happen inside the handler, so they see the container's own
    // variables rather than the test process's.
    const cache = new RateCache(process.env["CACHE_URL"] ?? "");
    const rate = await cache.rate("GBP");

    await new DynamoDBClient({}).send(
      new PutItemCommand({
        TableName: process.env["TABLE_NAME"],
        Item: { currency: { S: "GBP" }, rate: { S: rate } },
      }),
    );
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "rates-worker",
    taskRoleArn: taskRole.Role.Arn,
    containerDefinitions: [
      {
        name: "app",
        image: "rates-worker:1",
        environment: [
          // Simulated by Yulin, reached with no network involved.
          { name: "TABLE_NAME", value: "rates" },
          // Yours, connected to the way it normally would be.
          { name: "CACHE_URL", value: "redis://127.0.0.1:6379" },
        ],
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "rates-worker" }));
await simAws.backgroundTasksComplete();

const stored = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "rates",
    Key: { currency: { S: "GBP" } },
  }),
);

console.log(stored.Item?.["rate"]?.S); // "1.27"
