# AWS SDK interception

`SimSdk` routes AWS SDK for JavaScript v3 commands to Yulin. Use it to test code that already sends
commands through AWS SDK clients.

## Install interception in suite setup

Application tests should normally create one `SimSdk` in Vitest suite setup and keep its class
interceptions installed for the whole suite. Every SDK client then reaches the same simulated state,
including clients created in different test files.

The [test suite setup guide](https://yulinsim.dev/testing/) shows how to share one in-process
environment across Vitest files. It also covers the worker and isolation settings this requires.
A separate `SimSdk` for each test or file remains supported when a case needs an empty environment.
Tests that control the simulation's clock should use a separate `SimSdk` so their time changes cannot
affect the shared suite.

## Intercept a client

Create a `SimSdk`, intercept a client class, and run the code under test:

```typescript sim-sdk-intercept-s3
/**
 * Intercepting the S3 SDK client with simulated AWS behind it.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(S3Client); // Intercepts every instance of the class.

// From here on, this is ordinary AWS SDK code.
const s3Client = new S3Client({ region: "eu-west-2" });
await s3Client.send(new CreateBucketCommand({ Bucket: "foo-bucket" }));
await s3Client.send(
  new PutObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
    Body: "Hello, world!",
  }),
);

const output = await s3Client.send(
  new GetObjectCommand({ Bucket: "foo-bucket", Key: "hello.txt" }),
);
console.log(await output.Body?.transformToString()); // "Hello, world!"

simSdk.restoreAll();
```

Intercepting a class affects every instance of that class. This includes clients created after the
call to `intercept`. Intercepting an object affects that client only.

`SimSdk` replaces the intercepted client's `send` method. It routes each command to the matching
Yulin service and returns an SDK-shaped response. The request stays inside the process.

A client can have one active interception. A second interception throws
`SimSdkAlreadyInterceptedError` and leaves the first one in place.

## Access simulated state

`new SimSdk()` creates a `SimAws` instance and exposes it as `simSdk.simAws`. Use that instance to
prepare state before running the application, or to inspect state afterwards.

Pass an existing instance as `new SimSdk({ simAws })` when several parts of a test need to share the
same simulation.

## Account and region

Yulin resolves the account and region for every `send` call. The client's `region` configuration
selects the simulated region. Yulin uses its default region when the client has none.

The current `simAws.runAs(...)` caller selects the account. Without a `runAs` caller, Yulin uses the
simulation's default account and caller. Simulated [IAM](https://yulinsim.dev/services/iam/)
authorization applies to intercepted commands.

Use `runAs` to send commands as a role without changing the client or the application code:

```typescript sim-sdk-run-as
/**
 * Attributing intercepted SDK Commands to a caller with runAs.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
const simSdk = new SimSdk({ simAws });

// Seed a Bucket, and a Role allowed to list Buckets, in a simulated Account.
const account = simAws.account("222222222222");
await account
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "team-bucket" }));
await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "TeamRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::222222222222:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);
await account.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "TeamRole",
    PolicyName: "list-buckets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:ListAllMyBuckets",
        Resource: "*",
      },
    }),
  }),
);

const s3Client = new S3Client({ region: "us-east-1" });
simSdk.intercept(s3Client);

await simAws.runAs(
  { kind: "arn", arn: "arn:aws:iam::222222222222:role/TeamRole" },
  async () => {
    // Sent as the TeamRole caller: resolved in Account 222222222222 and
    // authorized against the Role's simulated IAM permissions.
    const output = await s3Client.send(new ListBucketsCommand({}));
    console.log(output.Buckets); // [{ Name: "team-bucket" }]
  },
);

simSdk.restoreAll();
```

`runAs` applies only to the `SimAws` instance on which it was called. A caller set on another
simulation does not affect these commands.

## Restore the client

Restore an interception before later code needs the client's original `send` method:

- Save the result of `simSdk.intercept(...)` and call its `restore()` method to restore one client.
- Call `simSdk.restoreAll()` to restore every client intercepted by that `SimSdk`.
- Declare `SimSdk` or an interception handle with `using` to restore it when the scope ends.

A suite-wide interception stays installed until the test worker exits. Do not restore it in a
per-file `afterAll`, since later files use the same interception and simulated state.

## Limit the intercepted commands

An interception handles every command by default. Pass an allow list when a test should accept only
specific commands:

`simSdk.intercept(s3Client, { commands: [GetObjectCommand] })`

The list accepts command classes or command names. Sending another command throws
`SimSdkCommandNotInterceptedError`.

## Intercept the DynamoDB document client

The DynamoDB document client accepts plain JavaScript values. Intercept the document client object,
then send `@aws-sdk/lib-dynamodb` commands through it:

```typescript sim-sdk-document-client
/**
 * An intercepted DynamoDB document client, writing plain JavaScript values.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);

// The document client is what gets intercepted, not the client it was built
// from.
simSdk.intercept(documents);

// A document client forwards a Command it has no document form of, so the
// table is created through the same client.
await documents.send(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

await documents.send(
  new PutCommand({
    TableName: "OrdersTable",
    Item: { orderId: "order-1", total: 42, paid: true },
  }),
);

const read = await documents.send(
  new GetCommand({ TableName: "OrdersTable", Key: { orderId: "order-1" } }),
);

console.log(read.Item?.["total"]); // 42
console.log(read.Item?.["paid"]); // true
```

`DynamoDBDocumentClient.from(client)` returns a separate client object. Intercept that object, not
the base `DynamoDBClient`. You may intercept both clients. They use the same simulated tables when
their account and region match.

Yulin converts document values at the interception boundary. It uses the default translation
options from `@aws-sdk/lib-dynamodb`. The [DynamoDB documentation](https://yulinsim.dev/services/dynamodb/#the-document-client)
lists the supported value conversions.

## Available functionality

SDK interception supports these service clients:

- ACM
- API Gateway REST APIs and HTTP APIs
- Athena
- AWS Backup
- Bedrock Runtime
- CloudFormation
- CloudFront and CloudFront KeyValueStore
- CloudWatch metrics and CloudWatch Logs
- Cognito Identity Provider
- DynamoDB and DynamoDB Streams
- ECS and Elastic Load Balancing v2
- EventBridge and EventBridge Scheduler
- Glue
- IAM
- Kinesis Data Firehose and Kinesis Data Streams
- KMS
- Lambda
- Personalize, Personalize Events, and Personalize Runtime
- Rekognition
- Route 53
- S3
- Secrets Manager
- SESv2
- SNS and SQS
- SSM
- Step Functions
- STS
- WAFv2

Each service page lists the commands that service accepts. An unsupported command throws
`SimSdkUnsupportedCommandError` and includes the supported command names. A client for an unknown
service throws `SimSdkUnknownServiceError`.

## Limitations

- Yulin intercepts `client.send(command)`. SDK utilities that bypass `send`, including
  `getSignedUrl`, bypass interception. Paginators and waiters use `send` and can be intercepted. To
  use a presigned URL with Yulin, point the client at a served endpoint as shown in the
  [S3 documentation](https://yulinsim.dev/services/s3/#presigned-urls).
- Simulated errors have SDK-shaped `name` and `$metadata` fields. They are separate classes from the
  SDK exceptions, so match them by `error.name` instead of `instanceof`.
- The callback form of `send(command, callback)` is not supported. Use the promise form.
- Yulin ignores the translation options in
  `DynamoDBDocumentClient.from(client, { marshallOptions, unmarshallOptions })`. The conversion uses
  the defaults. `removeUndefinedValues: true` has no effect. Yulin refuses an `undefined` attribute
  that the configured document client would otherwise remove.
