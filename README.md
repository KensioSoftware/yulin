# <img src="https://yulinsim.dev/favicon.png" alt="Yulin logo" width="28" height="28">&nbsp;&nbsp;Yulin local AWS simulator

[![npm version](https://img.shields.io/npm/v/%40kensio%2Fyulin)](https://www.npmjs.com/package/@kensio/yulin)
![CI](https://img.shields.io/github/actions/workflow/status/kensioSoftware/yulin/pr.yml?label=CI)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/hughgrigg/60631670004a3f173e7b379bfb9d5072/raw/coverage.json)
![Node](https://img.shields.io/node/v/%40kensio%2Fyulin)
![TypeScript](https://img.shields.io/badge/TS-TypeScript-3178C6)
![License](https://img.shields.io/npm/l/%40kensio%2Fyulin)

AWS system behaviour simulation for isolated unit testing, local development and CI.

[https://yulinsim.dev/](https://yulinsim.dev/ "Yulin local AWS simulator docs website")

## Installation

```bash
npm i -D @kensio/yulin
```

## Service specific docs

- [ACM](./docs/services/acm "Simulated ACM docs")
- [CloudFormation](./docs/services/cloudformation "Simulated CloudFormation docs")
- [CloudFront](./docs/services/cloudfront "Simulated CloudFront docs")
- [IAM](./docs/services/iam "Simulated IAM docs")
- [KMS](./docs/services/kms "Simulated KMS docs")
- [Lambda](./docs/services/lambda "Simulated Lambda docs")
- [Route53](./docs/services/route53 "Simulated Route53 docs")
- [S3](./docs/services/s3 "Simulated S3 docs")
- [Secrets Manager](./docs/services/secretsmanager "Simulated Secrets Manager docs")
- [SSM Parameter Store](./docs/services/ssm "Simulated SSM Parameter Store docs")
- [STS](./docs/services/sts "Simulated STS docs")

## Feature specific docs

- [AWS SDK interception](./docs/sdk "Simulated AWS SDK docs")
- [Simulated time](./docs/time "Simulated time docs")

## Usage

### Intercept AWS SDK clients

If your code uses the AWS SDK, you can intercept AWS SDK clients and route their Commands to
simulated AWS services. Your implementation code uses the SDK as normal and never needs to know that
it's dealing with a simulator behind the scenes:

```typescript
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(S3Client); // Intercepts every instance of the client class.

// The code under test uses the AWS SDK as normal.
const s3Client = new S3Client({ region: "eu-west-2" });
await s3Client.send(new CreateBucketCommand({ Bucket: "foo-bucket" }));
await s3Client.send(
  new PutObjectCommand({
    Bucket: "foo-bucket",
    Key: "foo.txt",
    Body: "Hello, world!",
  }),
);

const output = await s3Client.send(
  new GetObjectCommand({ Bucket: "foo-bucket", Key: "foo.txt" }),
);
console.log(await output.Body?.transformToString()); // "Hello, world!"

simSdk.restoreAll(); // Or `using simSdk = new SimSdk();` to restore on scope exit.
```

You can intercept a client class, as above, or a single client instance. The simulated Account and
Region scope is resolved per send: the Region comes from the sending client's configuration, and
the Account from the ambient `simAws.runAs(...)` caller when one is set, falling back to the
simulation defaults.

Each `SimSdk` owns its own isolated simulated AWS, available as `simSdk.simAws` when a test needs
to seed or inspect simulated state directly. To share state with an existing simulation, wrap it
with `new SimSdk({ simAws })`.

See the [simulated AWS SDK docs](./docs/sdk "Simulated AWS SDK docs") for full usage.

### Direct interaction with simulated AWS

You can also create and interact directly with a simulated AWS:

```typescript
import { SimAws } from "@kensio/yulin";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

const simAws = new SimAws();

// Default Account and Region.
await simAws.dynamoDb().createTable(
 new CreateTableCommand({
   TableName: "FoobarTable",
   KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
 }),
);

// Specify Account.
await simAws.account("111111111111").dynamoDb().createTable({ ... });

// Specify Region.
await simAws.region("eu-west-2").dynamoDb().createTable({ ... });

// Specify Account and Region.
await simAws.account("111111111111").region("eu-west-2").dynamoDb().createTable({ ... });
```

AWS state is simulated internally, so you can test realistic interactions with multiple AWS
services.

Each instance of `SimAws` is cheap and encapsulated so you can create them wherever you need them.
It's fine to create a new instance of `SimAws` in every test case or in shared test setup.

If you prefer, you can also instantiate simulated services individually:

```typescript
import { SimS3 } from "@kensio/yulin/s3";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

const simS3 = new SimS3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-bucket" }));
```

That simulated service then has its own isolated state.

### Serve simulated AWS on localhost

You can listen on a port to serve your simulated AWS on localhost:

```typescript
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws }); // Chooses available port on localhost.

const simS3 = simAws.region("eu-west-2").s3();
await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "foo-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
    },
  }),
);
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "foo/index.html",
    Body: "<h1>Hello, world!</h1>",
    Metadata: {
      "content-type": "text/html; charset=utf-8",
    },
  }),
);

const bucketWebsiteUrl = srv.localUrl(simS3.getBucketWebsiteUrl("foo-site"));
console.log(bucketWebsiteUrl.toString());

// Fetch /foo/index.html from the simulated S3 bucket website via port on localhost.
const res = await fetch(new URL("/foo/", bucketWebsiteUrl));
```

### Control simulated time

Each simulated AWS has its own clock, which you can freeze, set, or advance. This lets a test
exercise behaviour that only happens once time passes, without waiting for it and without replacing
the clock for the whole process:

```typescript
import { SimAws } from "@kensio/yulin";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";

const simAws = new SimAws();

// Assumes a ReportingRole this Account is already allowed to assume; the
// simulated time docs below show the same example with its IAM setup.
const { Credentials } = await simAws.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${simAws.defaultAccountId}:role/ReportingRole`,
    RoleSessionName: "reporting-session",
    DurationSeconds: 900,
  }),
);

await simAws.clock().advanceBy({ minutes: 20 });

// Those session credentials have now expired.
```

Advancing runs whatever falls due during the interval and returns once the simulation has settled,
so the next line can assert. Time belongs to the `SimAws` instance, so moving it never disturbs
another simulation, or the real clock. See the
[simulated time docs](./docs/time "Simulated time docs") for full usage.

## What is yulin?

TLDR: yulin is an AWS simulator for testing Node.js applications.

The simulation is not only local to the machine, but in the same single process
with the test and application under test. No network or external i/o is
involved. This is what "isolated" refers to.

This "isolated system" approach to testing has a few advantages:

- Tests run fast as everything is in memory with no real networking.
- Test set-up is fast and uncomplicated, as there are no containers or extra
  dependencies to manage.
- It's straightforward to use multiple other mocks and simulators alongside
  yulin, such as [nock](https://github.com/nock/nock), as yulin makes no
  assumptions about the environment.
- You can control everything in each isolated test process, such as controlling
  the current time, even when multiple different AWS services are simulated.
- One test can cover **meaningful system behaviour** across multiple AWS
  services and applications, such as Lambdas sending events to SQS queues to be
  picked up by other Lambdas, or DynamoDB streams triggering Lambdas.

That last point is the most important. The motivation behind yulin is to enable
efficient tests that cover the logical behaviour of a system. That is in
contrast to less valuable microscopic unit tests with fiddly mocks and brittle
assertions. The goal of yulin is to allow you to test system behaviours that are
meaningful to users and stakeholders.

## What's in a name?

The word yǔlín (雨林) is Chinese for "rainforest". This is a roundabout reference
to "Amazon" as in Amazon Web Services.

## Development

Install pnpm

```bash
pnpm i
```
