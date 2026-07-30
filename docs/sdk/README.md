# Simulated AWS SDK

Yulin can intercept AWS SDK clients and route their Commands to simulated AWS services. The code
under test uses the AWS SDK as it would in production, and needs no knowledge of the simulator.

This is the recommended way to test implementation code that already uses the AWS SDK. Direct
interaction with `SimAws` remains useful for seeding and inspecting simulated state from within
tests.

## How it works

`SimSdk` replaces the `send` method of an intercepted SDK client. Each sent Command is routed by
name to the matching operation of a simulated AWS service, and the result is returned to the
caller as a normal SDK response. Nothing touches the network.

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
- **An instance** (`simSdk.intercept(s3Client)`) intercepts only that instance, which is useful
  when a specific client should hit the simulator while others are handled differently.

A client can only have one interception at a time: intercepting an already-intercepted client
throws a diagnostic error rather than silently replacing the existing interception.

## Account and Region scope

The simulated Account and Region scope is resolved for each sent Command, never fixed per client:

1. The **Region** comes from the sending client's own configuration, such as
   `new S3Client({ region: "eu-west-2" })`, falling back to the simulation default.
2. The **Account** comes from the ambient `simAws.runAs(...)` caller when one is set, falling back
   to the simulation default Account.

The resolved caller is passed through to the simulated service, so simulated
[IAM](../services/iam/) authorization applies to it exactly as for direct sim service use: a
caller without permission for a Command is denied, like real AWS. When no caller can be
identified, Commands run as the simulation's default Account root.

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

The ambient caller is scoped to its own `SimAws` instance, so separate simulations in the same
process never observe each other's callers.

## Restoring interception

Restoring puts back the client's real SDK `send`:

- `interception.restore()` restores one interception; `simSdk.intercept(...)` returns the handle.
- `simSdk.restoreAll()` restores everything intercepted through that `SimSdk`.
- `SimSdk` and interception handles are disposable, so `using simSdk = new SimSdk();` restores
  automatically at the end of the scope, which is convenient in tests.

## Choosing Commands to intercept

By default every Command sent through an intercepted client is routed to the simulator. To
intercept only specific Commands, pass an allow list of Command classes or names:
`simSdk.intercept(s3Client, { commands: [GetObjectCommand] })`. Commands outside the allow list
throw a diagnostic error.

## Supported services and Commands

All simulated services support SDK interception: ACM, CloudFormation, CloudFront, Cognito, DynamoDB,
IAM, KMS, Lambda, Route53, S3, Secrets Manager, SSM and STS. Each service's own docs under
[docs/services](../services/) list the Commands it simulates.

Both kinds of gap are refused on send rather than misbehaving silently, with a different error each:

- A Command the simulated service doesn't support throws `SimSdkUnsupportedCommandError`, naming the
  Command and listing the Commands that service does support.
- A client for an AWS service Yulin doesn't simulate at all throws `SimSdkUnknownServiceError`,
  naming the service. There is no Command list to report, since no simulated service was resolved.

## Limitations

- Only `client.send(command)` is intercepted. SDK utilities that bypass `send`, such as
  `getSignedUrl`, see nothing of interception. Paginators and waiters go through `send`, so they
  work. Presigning needs no interception: point the client at the simulated endpoint instead, as
  [the sim S3 presigned URL docs](../services/s3/README.md#presigned-urls) show.
- Simulated errors carry SDK-shaped `name` and `$metadata`, but are not instances of the real SDK
  exception classes: match errors with `error.name`, not `instanceof`.
- The callback form of `send(command, callback)` is not supported; use the promise form.
