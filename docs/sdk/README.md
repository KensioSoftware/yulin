# Simulated AWS SDK

Yulin can intercept AWS SDK clients and route their Commands to simulated AWS services. The code
under test uses the AWS SDK as it would in production, and needs no knowledge of the simulator.

This is the recommended way to test implementation code that already uses the AWS SDK. Direct
interaction with `SimAws` remains useful for seeding and inspecting simulated state from within
tests.

## How it works

`SimSdk` replaces the `send` method of an intercepted SDK client. Each sent Command is routed by
name to the matching operation of a simulated AWS service, and the result comes back to the caller
as a normal SDK response. Every Command is served in process.

Every `SimSdk` owns a simulated AWS environment. You can let it create its own, or give it an
existing one to share:

- `new SimSdk()` creates an isolated `SimAws` internally, available as `simSdk.simAws`.
- `new SimSdk({ simAws })` wraps a `SimAws` you already have.

## Basic usage

Intercept an SDK client class, then use the SDK as normal:

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

You can intercept a client class or a client instance:

- **A class** (`simSdk.intercept(S3Client)`) intercepts every instance of it, including instances
  the code under test constructs later. This is the most common choice.
- **An instance** (`simSdk.intercept(s3Client)`) intercepts only that instance. Use it when one
  client should hit the simulator and the others are handled some other way.

A client can only have one interception at a time. Intercepting an already-intercepted client
throws a diagnostic error, and the existing interception stays in place.

## Account and Region scope

Each sent Command resolves its own simulated Account and Region scope:

1. The **Region** comes from the sending client's own configuration, such as
   `new S3Client({ region: "eu-west-2" })`, falling back to the simulation default.
2. The **Account** comes from the ambient `simAws.runAs(...)` caller when one is set, falling back
   to the simulation default Account.

The resolved caller reaches the simulated service, and simulated [IAM](https://yulinsim.dev/services/iam/)
authorization applies to it exactly as it does for direct sim service use. A caller without
permission for a Command is denied, as on real AWS. Where no caller can be identified, Commands run
as the simulation's default Account root.

`runAs` runs a function with an ambient simulated caller, such as an IAM Role. Commands sent during
the run are attributed to that caller, with no changes to the client or the code under test:

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

The ambient caller belongs to its own `SimAws` instance. Separate simulations in the same process
each keep their own.

## Restoring interception

Restoring puts back the client's real SDK `send`:

- `interception.restore()` restores one interception. `simSdk.intercept(...)` returns the handle.
- `simSdk.restoreAll()` restores everything intercepted through that `SimSdk`.
- `SimSdk` and interception handles are disposable. `using simSdk = new SimSdk();` restores
  automatically at the end of the scope.

## Choosing Commands to intercept

By default every Command sent through an intercepted client is routed to the simulator. To
intercept only specific Commands, pass an allow list of Command classes or names:
`simSdk.intercept(s3Client, { commands: [GetObjectCommand] })`. Commands outside the allow list
throw a diagnostic error.

## The DynamoDB document client

`@aws-sdk/lib-dynamodb` takes plain JavaScript values. Application code writes
`{ id: "a", count: 1 }` where the base client wants `{ id: { S: "a" }, count: { N: "1" } }`.
Intercept the document client and its Commands reach simulated DynamoDB with the values already
converted. Code written against the document client runs against the simulator unchanged.

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

`DynamoDBDocumentClient.from(client)` builds a separate object of its own class. Intercepting the
base client therefore leaves Commands sent through the document client alone. Intercept the
document client. Both can be intercepted at once, and they reach
the same simulated tables, since the document client shares the base client's config and so
resolves the same Account and Region.

The real document client converts values in middleware, which runs inside the `send` that
interception replaces. So the conversion happens at the interception boundary instead, using the
option defaults `lib-dynamodb` sets (not the `util-dynamodb` ones). Which native types map to which
descriptors is in [the sim DynamoDB docs](https://yulinsim.dev/services/dynamodb/#the-document-client).

## Supported services and Commands

These simulated services support SDK interception: ACM, API Gateway v2, CloudFormation, CloudFront,
CloudWatch, CloudWatch Logs, Cognito, DynamoDB, DynamoDB Streams, ECS, Elastic Load Balancing v2,
EventBridge, EventBridge Scheduler, IAM, KMS, Lambda, Rekognition, Route53, S3, Secrets Manager,
SES, SNS, SQS, SSM, STS and WAFv2. Each service's own docs under
[docs/services](../services/) list the Commands it simulates.

A gap in that coverage is refused on send, with a different error for each kind:

- A Command the simulated service doesn't support throws `SimSdkUnsupportedCommandError`, naming the
  Command and listing the Commands that service does support.
- A client for an AWS service Yulin doesn't simulate at all throws `SimSdkUnknownServiceError`,
  naming the service. There is no Command list to report, since no simulated service was resolved.

## Limitations

- Only `client.send(command)` is intercepted. SDK utilities that bypass `send`, such as
  `getSignedUrl`, run against real AWS. Paginators and waiters go through `send`, so they work. Presigning works without interception. Point the client at the simulated endpoint, as
  [the sim S3 presigned URL docs](https://yulinsim.dev/services/s3/#presigned-urls) show.
- Simulated errors carry SDK-shaped `name` and `$metadata`, but are not instances of the real SDK
  exception classes. Match an error by its `error.name`. An `instanceof` check against the SDK class
  fails.
- The callback form of `send(command, callback)` is not supported. Use the promise form.
- The translate config a document client is built with,
  `DynamoDBDocumentClient.from(client, { marshallOptions, unmarshallOptions })`, is ignored. The
  conversion always uses the defaults. `removeUndefinedValues: true` in particular has no effect
  here, and an `undefined` attribute is refused where AWS would have dropped it. The refusal names
  the attribute and says so.
