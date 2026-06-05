# yulin

AWS system behaviour simulation for isolated unit testing, local development and CI.

## Installation

```bash
npm i -D @kensio/yulin
```

## Usage

### Direct interaction with simulated AWS

Create and interact directly with a simulated AWS:

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

const simAws = new SimAws();
const srv = await serveSimAws(simAws); // Chooses available port on localhost.

const simS3 = srv.simAws.region("eu-west-2").s3();
await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simS3.putObject(
    new PutObjectCommand({
       Bucket: "foo-site",
       Key: "index.html",
       Body: "<h1>Hello, world!</h1>",
       Metadata: {
          "content-type": "text/html; charset=utf-8",
       },
    }),
);

// Fetch from the simulated S3 bucket via port on localhost.
const res = await fetch(
    `http://foo-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
);
```

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
