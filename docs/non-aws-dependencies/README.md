# Non-AWS dependencies

Most applications talk to something other than AWS, such as a Redis or a Postgres. This page covers
what happens to those when the application runs under Yulin.

## Two kinds of dependency

A simulated Lambda function and a simulated ECS container both run your own code in the same Node.js
process as the test. Everything that code talks to falls into one of two categories.

Simulated AWS services are handled by Yulin. A DynamoDB call reaches an in-memory table and an S3
call reaches an in-memory bucket, with no network involved. [AWS SDK interception](../sdk/README.md)
is how an ordinary SDK client in the code under test gets there.

Everything else is yours to provide, and connects the way it normally would. Yulin leaves it alone
entirely, with no simulation and no interception. Code that opens a Redis connection opens a real
one, to whatever address it was given.

## Pointing the code at your own dependency

A deployed Lambda function or ECS container reads its connection details from environment variables.
The simulated ones do the same. A function's `Environment.Variables` and a container definition's
`environment` are visible through `process.env` while the code runs, so pointing the application
somewhere else means setting the value it already reads. No Yulin feature is involved, and the code
under test stays as it is.

```typescript non-aws-dependency-lambda
/**
 * Pointing a simulated Lambda function at a dependency Yulin does not
 * simulate, alongside one it does.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rates",
    Role: "arn:aws:iam::111111111111:role/RatesRole",
    Environment: {
      Variables: {
        // Simulated by Yulin, reached with no network involved.
        TABLE_NAME: "rates",
        // Yours. A deployment points this at ElastiCache. A test points it
        // at whatever it wants the code to talk to instead.
        CACHE_URL: "redis://127.0.0.1:6379",
      },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        // Building a Redis client from the second value involves nothing of
        // Yulin's. It is an ordinary environment variable read.
        tableName: process.env["TABLE_NAME"],
        cacheUrl: process.env["CACHE_URL"],
      })),
    },
  }),
);

const output = await lambda.invoke(
  new InvokeCommand({ FunctionName: "rates" }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
// {"tableName":"rates","cacheUrl":"redis://127.0.0.1:6379"}
console.log(Buffer.from(output.Payload).toString());
```

What that address points at is up to the test. A Redis running on localhost, one the test suite
starts in a container, or a stand-in the test defines itself all work, because the application is
doing what it always does with the value it is given.

## A container reading from both

The worked example below runs one simulated ECS container that writes to a simulated DynamoDB table
and reads from a cache of its own. The two categories sit next to each other in the same handler and
are configured the same way, through the container definition's `environment`.

The cache here is a stand-in defined by the example, and it works with no server running. A real
client built from `CACHE_URL` would go in the same place.

```typescript non-aws-dependency-ecs
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
```

The DynamoDB write is authorized as the task role, in the same way it would be in a deployment. The
cache read passes through no authorization at all, because IAM has no part in it.

## Sidecar containers are not started

A task definition sometimes declares the dependency itself as a second container, such as a Redis
running next to the application in the same task. Yulin never looks inside a container image, and
the only thing it can run is JavaScript or TypeScript in its own process. An image holding a Redis
server is beyond it.

The container is stored and reported back as declared, and it is recorded as not simulated when the
task runs, with a reason saying so. An application expecting it has to be given something else to
talk to. Set the variable holding the address to something that answers, whether that is a Redis you
run yourself or a stand-in, in the same way as for any other dependency of your own.

## Reads happen inside the handler

Handler code gets the function's or the container's variables while it runs, and reads the host
process environment otherwise. A read at module scope, as in `const url = process.env.CACHE_URL` at
the top of a file, happens when the test imports that file rather than when the code runs. It sees
the host value.

That matters here because a connection is often built at module scope. Read inside the handler, or
build the client there, to get the configured value. Sim Lambda warns on the console when the
difference changes what the code sees, which is covered under
[environment variables](../services/lambda/README.md#environment-variables) on the simulated Lambda
page. Zip code running in the vm runtime is unaffected, because it is imported during an invocation.

## Limitations

Current documented limitations:

- Everything outside the simulated AWS services is yours to run and to tear down. Yulin starts none
  of it.
- A dependency declared as a sidecar container in an ECS task definition is not started, because
  Yulin never runs a container image.
- A connection built at module scope reads the host environment rather than the function's or the
  container's, since the value is read before anything runs.
- There is no interception point for a non-AWS dependency. The way to send the code somewhere else
  is the environment variable it already reads, or an injection point in the code itself.
