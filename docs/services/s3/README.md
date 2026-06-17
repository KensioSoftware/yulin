# Simulated S3

Yulin includes a simulated S3 service for isolated tests, local development, and CI.

Sim S3 can be used directly through `SimAws` or instantiated on its own as `SimS3` with isolated
state. Yulin can serve a simulated S3 service on localhost.

## Available functionality

Sim S3 currently supports:

- Creating Buckets with `CreateBucketCommand`
- Listing Buckets with `ListBucketsCommand`
- Putting Objects with `PutObjectCommand`
- Getting Objects with `GetObjectCommand`
- Listing Objects with `ListObjectsCommand`
- Configuring static website hosting with `PutBucketWebsiteCommand`
- Serving static website requests on localhost with `serveSimAws`
- Bucket website index documents, error documents, trailing-slash redirects, redirect-all
  configuration, and routing-rule redirects
- Bucket-global uniqueness within a `SimAws` instance across simulated Accounts and Regions
- In-memory Object storage by default
- Optional filesystem-backed Bucket storage with `mountBucketFilesystem(...)`

The simulator focuses on useful behavior for isolated tests and local development rather than full
S3 feature parity. Unsupported S3 options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behaviour.

## Basic usage

Create a simulated AWS environment, get simulated S3, create a Bucket, and put an Object into it.

```typescript sim-s3-bucket
/**
 * Creating a simulated S3 Bucket and putting an Object into it.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
    Body: "Hello from simulated S3",
    ContentType: "text/plain; charset=utf-8",
    Metadata: {
      source: "yulin",
    },
  }),
);

const getObjOut = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
  }),
);

console.log(getObjOut.Body);
console.log(getObjOut.Metadata?.["source"]);
```

`PutObjectCommand` currently accepts `string`, `Uint8Array`, or `undefined` for `Body`. An undefined
body is stored as an empty Object.

`ContentType` is exposed as Object metadata under the `content-type` header name and is used when
serving Bucket website responses.

## Accounts and Regions

Use `SimAws` scopes to simulate S3 in different AWS Accounts and Regions.

```typescript sim-s3-account-region-scoping
/**
 * Simulated S3 Account and Region scoping.
 */

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultS3 = simAws.s3();
const euWest2S3 = simAws.region("eu-west-2").s3();
const accountS3 = simAws.account("111111111111").s3();
const scopedS3 = simAws.account("222222222222").region("ap-east-1").s3();

await defaultS3.createBucket(
  new CreateBucketCommand({
    Bucket: "default-bucket",
  }),
);

await euWest2S3.createBucket(
  new CreateBucketCommand({
    Bucket: "eu-west-2-bucket",
  }),
);

await accountS3.createBucket(
  new CreateBucketCommand({
    Bucket: "account-bucket",
  }),
);

await scopedS3.createBucket(
  new CreateBucketCommand({
    Bucket: "scoped-bucket",
  }),
);
```

Within one `SimAws` instance, Bucket names are globally registered across Accounts and Regions.
Creating a Bucket with a name already used in another simulated Region or Account throws an error.

Each `SimAws` instance has its own isolated state, so you can create a fresh `SimAws` instance per
test or share one across all tests as you prefer.

## Listing Buckets

Use `ListBucketsCommand` to inspect Buckets in the selected simulated S3 scope.

```typescript sim-s3-list-buckets
/**
 * Listing Buckets in simulated S3.
 */

import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

const listBucketsOutput = await simS3.listBuckets(new ListBucketsCommand());

console.log(listBucketsOutput.Buckets?.map((bucket) => bucket.Name));
```

## Listing Objects

Use `ListObjectsCommand` to list Object keys in a Bucket. The simulator supports `Prefix`, `MaxKeys`,
and `Marker`.

```typescript sim-s3-list-objects
/**
 * Listing Objects in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "assets-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "images/logo.svg",
    Body: "<svg></svg>",
    ContentType: "image/svg+xml",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

const listObjectsOutput = await simS3.listObjects(
  new ListObjectsCommand({
    Bucket: "assets-bucket",
    Prefix: "docs/",
    MaxKeys: 10,
  }),
);

for (const object of listObjectsOutput.Contents ?? []) {
  console.log(object.Key, object.Size);
}
```

Object listings are sorted by key.

## Static website hosting

Configure Bucket website hosting with `PutBucketWebsiteCommand`.

```typescript sim-s3-static-website-hosting
/**
 * Simulated S3 static website hosting.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-site",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Hello from simulated S3</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

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

console.log(simS3.getBucketWebsiteUrl("foo-site").toString());
```

With an index document configured:

- `/` resolves to `index.html`
- `/docs/` resolves to `docs/index.html`
- `/docs` redirects to `/docs/` when `docs/index.html` exists

Static website hosting must be enabled before the sim Bucket can be served over HTTP. If it is not
enabled, the localhost server returns `403`.

## Serve simulated S3 on localhost

Use `serveSimAws` when you want application code to make real HTTP requests to the simulated S3, or
to access the simulated services via your browser or commandline with curl.

```typescript sim-s3-serve-localhost
/**
 * Serving simulated S3 on localhost.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(
    new CreateBucketCommand({
      Bucket: "foo-site",
    }),
  );

  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "foo-site",
      Key: "index.html",
      Body: "<h1>Hello from localhost S3</h1>",
      ContentType: "text/html; charset=utf-8",
    }),
  );

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

  const websiteUrl = simS3.getBucketWebsiteUrl("foo-site");
  const localWebsiteUrl = srv.localUrl(websiteUrl);

  const response = await fetch(localWebsiteUrl);

  console.log(response.status);
  console.log(response.headers.get("content-type"));
  console.log(await response.text());
} finally {
  srv.close();
}
```

The `getBucketWebsiteUrl(...)` method returns the simulated S3 website URL for the Bucket. The
`localUrl(...)` method on the localhost server adapts that URL so the request is sent to the local
server while preserving the simulated S3 website hostname.

## Error documents

Configure an error document to return custom content with a `404` response when an Object is
missing.

```typescript sim-s3-error-document
/**
 * Simulated S3 error documents.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "error-site",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "error-site",
    Key: "error.html",
    Body: "<h1>Not found</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "error-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
      ErrorDocument: {
        Key: "error.html",
      },
    },
  }),
);
```

## Website redirects

Sim S3 supports common S3 website redirect configuration.

Redirect all requests to another host:

```typescript sim-s3-website-redirect
/**
 * Simulated S3 website redirects.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "redirect-site",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "redirect-site",
    WebsiteConfiguration: {
      RedirectAllRequestsTo: {
        HostName: "example.test",
        Protocol: "https",
      },
    },
  }),
);
```

Add routing rules for conditional redirects:

```typescript sim-s3-conditional-redirect
/**
 * Conditional redirects in simulated S3.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "docs-site",
  }),
);

await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "docs-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
      RoutingRules: [
        {
          Condition: {
            KeyPrefixEquals: "old/",
          },
          Redirect: {
            ReplaceKeyPrefixWith: "new/",
          },
        },
        {
          Condition: {
            HttpErrorCodeReturnedEquals: "404",
          },
          Redirect: {
            HttpRedirectCode: "302",
            ReplaceKeyWith: "not-found.html",
          },
        },
      ],
    },
  }),
);
```

The first matching routing rule is used. A rule can match by `KeyPrefixEquals`,
`HttpErrorCodeReturnedEquals`, both, or neither. Redirects support configured host, protocol,
replacement key, replacement key prefix, and redirect status code.

## Filesystem-backed Bucket storage

By default, simulated S3 stores Objects in memory. For local development, you can mount a Bucket to a
filesystem directory. This is handy for serving a static website on the local filesystem through
simulated S3.

```typescript sim-s3-filesystem-storage
/**
 * Local filesystem storage for simulated S3 Buckets.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "public-assets",
  }),
);

simS3.mountBucketFilesystem(
  "public-assets",
  path.join(process.cwd(), "public"),
);
```

After mounting, Object reads and writes for that Bucket use the filesystem directory.

Filesystem storage is somewhat restrictive to make it slightly safer:

- The directory path must be absolute
- The directory must not be the filesystem root
- The directory must not be the user's home directory
- The path must not contain `..`
- Object keys must not be absolute paths or contain `..`
- Unsupported file extensions are rejected or ignored
- Symlinks are ignored when listing Objects

When reading files from filesystem-backed storage, Yulin infers common `content-type` metadata from
file extensions such as `.html`, `.css`, `.js`, `.json`, `.png`, `.svg`, `.txt`, `.xml`, and common
font and image formats.

## Standalone SimS3

If you only need S3 alone, you can instantiate `SimS3` directly.

```typescript sim-s3-standalone
/**
 * Standalone simulated S3 instance.
 */

import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimS3 } from "@kensio/yulin/s3";

const simS3 = new SimS3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "standalone-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "standalone-bucket",
    Key: "hello.txt",
    Body: "Hello from standalone SimS3",
  }),
);
```

A standalone `SimS3` instance has its own isolated state and is not connected to a wider `SimAws`
environment.
