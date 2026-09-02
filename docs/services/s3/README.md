# Simulated S3

Yulin includes a simulated S3 service for tests and local development.

Sim S3 can be used directly through `SimAws` or instantiated on its own as `SimS3` with isolated
state. Yulin can serve a simulated S3 service on localhost.

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

const objectOut = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "foo-bucket",
    Key: "hello.txt",
  }),
);

console.log(objectOut.Body);
console.log(objectOut.Metadata?.["source"]);
```

`PutObjectCommand` currently accepts `string`, `Uint8Array`, or `undefined` for `Body`. An undefined
body is stored as an empty Object.

A read hands `ContentType` back in the field of the same name, and Bucket website responses are
served with it. It is one of several headers a write can say about an Object. See
[Object system metadata](#object-system-metadata).

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

Each `SimAws` instance has its own isolated state. Create a fresh one per test or share one across
all tests, as you prefer.

## Listing Buckets

Use `ListBucketsCommand` to inspect Buckets in the selected simulated S3 scope. Each Bucket reports the instant it was created, taken from [simulated time](https://yulinsim.dev/time/) rather than the host clock.

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
console.log(listBucketsOutput.Buckets?.[0]?.CreationDate);
```

## Asking whether something is there

`HeadObjectCommand` reports what a read would say about an Object without returning the Object, and `HeadBucketCommand` reports whether a Bucket is there and reachable. `HeadBucket` also reports the Region it was found in.

A HEAD response carries no body, so there is no document for an error code to travel in. Real S3 answers a `HeadObject` with `403` or `404`, and a `HeadBucket` with `400`, `403` or `404`, leaving the SDK to name the failure from the status alone. The simulator answers `404` for an absent Bucket and an absent Object alike, which an SDK client raises as `NotFound`, and `403` for a caller the permission is missing for. A read distinguishes `NoSuchBucket` from `NoSuchKey`, because a read has a body to say which.

`HeadObject` authorizes against `s3:GetObject` and `HeadBucket` against `s3:ListBucket`, as real S3 does, so knowing something is there needs the permission to read it.

## Listing Objects

Use `ListObjectsV2Command` to list the Objects in a Bucket. The simulator supports `Prefix`,
`Delimiter`, `MaxKeys`, `ContinuationToken` and `StartAfter`, and answers with `Contents`,
`CommonPrefixes`, `KeyCount`, `IsTruncated` and `NextContinuationToken`.

```typescript sim-s3-list-objects-v2
/**
 * Listing Objects in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
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

for (const key of ["docs/index.html", "docs/guide.html", "images/logo.svg"]) {
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "assets-bucket",
      Key: key,
      Body: "file contents",
    }),
  );
}

const listOutput = await simS3.listObjectsV2(
  new ListObjectsV2Command({
    Bucket: "assets-bucket",
    Prefix: "docs/",
  }),
);

console.log(listOutput.KeyCount);

const listedObjects = listOutput.Contents ?? [];
for (const object of listedObjects) {
  console.log(object.Key, object.Size, object.ETag, object.LastModified);
}
```

Listings are sorted by key, and a page holds at most 1,000 keys, as in real S3. `MaxKeys` above that
is lowered to it, and the response reports the page size that was actually used. A `MaxKeys` of zero
returns no keys and completes the listing, and a negative one is refused with `InvalidArgument`.

A listing that found no keys has no `Contents` at all, and the example reaches for `Contents ?? []`
for that reason. `KeyCount` is the count either way.

### Walking a truncated listing

A truncated response carries `NextContinuationToken`, which the next request passes as
`ContinuationToken`. The token is opaque, as it is in real S3. Pass it back unchanged, read nothing
out of it, and simulated S3 refuses one it did not issue.

```typescript sim-s3-list-objects-v2-pagination
/**
 * Walking a truncated Object listing in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "paged-bucket",
  }),
);

for (const key of ["a.txt", "b.txt", "c.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "paged-bucket", Key: key, Body: key }),
  );
}

// Ask for a page of one, so the listing has to be continued.
let continuationToken: string | undefined;
const allKeys: string[] = [];

do {
  const page = await simS3.listObjectsV2(
    new ListObjectsV2Command({
      Bucket: "paged-bucket",
      MaxKeys: 1,
      ContinuationToken: continuationToken,
    }),
  );

  const pageObjects = page.Contents ?? [];
  for (const object of pageObjects) {
    allKeys.push(object.Key ?? "");
  }

  continuationToken = page.NextContinuationToken;
} while (continuationToken !== undefined);

console.log(allKeys);
```

Code that never names `MaxKeys` never continues a listing in a test small enough to be readable, and
its pagination goes unexercised. `configureMaxKeysPerPage` lowers the page size for a whole simulated
S3 instead. A Bucket of two Objects is then enough to make the caller walk a continuation:

```typescript sim-s3-list-page-size
/**
 * Lowering the page size of a simulated S3 listing, so a caller that does not
 * set MaxKeys still has to ask for a second page.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();
simS3.configureMaxKeysPerPage(1);

await simS3.createBucket(new CreateBucketCommand({ Bucket: "small-pages" }));

for (const key of ["a.txt", "b.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "small-pages", Key: key, Body: key }),
  );
}

const firstPage = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "small-pages" }),
);

console.log(firstPage.IsTruncated, firstPage.KeyCount);
```

### Walking a Bucket as a folder tree

S3 stores keys flat and a `Delimiter` is what makes one look like a folder tree. Every key holding
the delimiter somewhere after the `Prefix` is rolled up into a common prefix, running from the start
of the key through the first delimiter. Those keys leave `Contents`, and the prefix appears once in
`CommonPrefixes` however many keys sit beneath it.

```typescript sim-s3-list-objects-v2-delimiter
/**
 * Walking a simulated S3 Bucket one folder at a time.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-assets" }));

for (const key of ["img/logo.png", "img/icons/tick.png", "index.html"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "site-assets", Key: key, Body: key }),
  );
}

const top = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "site-assets", Delimiter: "/" }),
);

// One folder, and the one key that sits beside it.
console.log(top.CommonPrefixes?.map((folder) => folder.Prefix)); // ["img/"]
console.log(top.Contents?.map((object) => object.Key)); // ["index.html"]

const folder = await simS3.listObjectsV2(
  new ListObjectsV2Command({
    Bucket: "site-assets",
    Prefix: "img/",
    Delimiter: "/",
  }),
);

// A delimiter inside the Prefix is stepped over, so this lists what is
// directly in `img/` rather than rolling the whole Bucket back up.
console.log(folder.CommonPrefixes?.map((child) => child.Prefix)); // ["img/icons/"]
console.log(folder.Contents?.map((object) => object.Key)); // ["img/logo.png"]
```

A listing that rolled nothing up has no `CommonPrefixes` at all, the way one that found no keys has
no `Contents`. Reach for `CommonPrefixes ?? []`.

A common prefix counts against `MaxKeys` as a key does, and `KeyCount` counts the two together. Keys
and prefixes are ordered together, so a truncated page can end on either, and the continuation steps
over the whole rolled-up prefix rather than listing its keys again. `aws s3 ls s3://bucket/` against
[a simulation served on localhost](#serve-simulated-s3-on-localhost) prints these as `PRE` lines.

### The first version of the operation

`ListObjectsCommand` is also simulated, with the `Marker` and `NextMarker` shape it has in real S3.
It lists the same keys as `ListObjectsV2Command` and is bounded by the same page size.

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

const objectContentItems = listObjectsOutput.Contents ?? [];
for (const object of objectContentItems) {
  console.log(object.Key, object.Size);
}
```

The marker is exclusive and lexicographic. A listing resumes after the key it names whether or not
the Bucket still holds it.

### Asking for encoded keys

An Object key can hold characters an XML document cannot carry, and a listing writes its keys into
XML. `EncodingType: "url"` asks for them encoded. Simulated S3 encodes every `Key`, the `Prefix` and
`Delimiter` the request named, each prefix in `CommonPrefixes`, and the marker or `StartAfter` key
the response carries, as real S3 encodes them. The listing reports `EncodingType` back.

```typescript sim-s3-list-objects-encoded-keys
/**
 * Listing a simulated S3 Bucket with its keys encoded.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simS3 = new SimAws().s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "invoices/March 2027 & April.pdf",
    Body: "invoice bytes",
  }),
);

const listed = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "uploads", EncodingType: "url" }),
);

console.log(listed.EncodingType); // url

const listedObjects = listed.Contents ?? [];

for (const listedObject of listedObjects) {
  const encodedKey = listedObject.Key ?? "";

  console.log(encodedKey); // invoices/March+2027+%26+April.pdf

  // S3 form-encodes a key, and a plus sign in one stands for a space.
  console.log(decodeURIComponent(encodedKey.replaceAll("+", " ")));
}
```

The encoding is the one an event notification record carries a key in. A space becomes a plus sign,
and the slashes of a key prefix are left as they are. Continuation tokens are left alone in either
version of the operation, being opaque already.

A listing that names no `EncodingType` answers with the keys as they were written, and says nothing
about an encoding. Any other value is refused with `InvalidArgument`.

The `encoding-type` query parameter carries this over a
[served endpoint](#serve-simulated-s3-on-localhost), and the SDK sets it from `EncodingType`.

## Object ETags

Every Object has an ETag, the MD5 of its body in hex and quoted, as real S3 gives it for a
single-part upload. `PutObject`, `GetObject`, both list operations and the S3 REST endpoint all
report the same one. A tool can compare what a Bucket holds against a local file without reading the
Object back.

```typescript sim-s3-object-etag
/**
 * Comparing a local file against a simulated S3 Object by content hash.
 */

import { createHash } from "node:crypto";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

const published = "<h1>Hello</h1>";
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "site-bucket",
    Key: "index.html",
    Body: published,
  }),
);

const listOutput = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "site-bucket" }),
);

const localFile = Buffer.from(published);
const localETag = `"${createHash("md5").update(localFile).digest("hex")}"`;

const listedObjects = listOutput.Contents ?? [];
for (const object of listedObjects) {
  // Nothing to upload: the Bucket already holds these bytes.
  console.log(object.Key, object.ETag === localETag);
}
```

An event notification record carries the same value unquoted, in its `eTag` field, as real S3
reports it there.

An Object uploaded in parts gets a different form. See
[Uploading an Object in parts](#uploading-an-object-in-parts).

## Uploading an Object in parts

`aws s3 cp` switches to a multipart upload above eight megabytes, and `@aws-sdk/lib-storage` uploads
in parts whatever the size. Sim S3 answers the six operations that path is made of, over the SDK and
over a served endpoint alike.

```bash
aws s3 cp ./big.bin s3://widgets/big.bin   # 12MB, multipart under the covers
aws s3 ls s3://widgets/                    # reports the whole 12MB Object
```

An upload is started, the parts are sent under the id it issues, and completing it stores one
Object. The parts can be sent in any order.

```typescript sim-s3-multipart-upload
/**
 * Uploading a simulated S3 Object in parts.
 */

import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads-bucket" }));

const started = await simS3.createMultipartUpload(
  new CreateMultipartUploadCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    ContentType: "text/csv",
  }),
);

const second = await simS3.uploadPart(
  new UploadPartCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    PartNumber: 2,
    Body: "2,two\n",
  }),
);

const first = await simS3.uploadPart(
  new UploadPartCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    PartNumber: 1,
    Body: "id,name\n1,one\n",
  }),
);

const completed = await simS3.completeMultipartUpload(
  new CompleteMultipartUploadCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    MultipartUpload: {
      Parts: [
        { PartNumber: 1, ETag: first.ETag },
        { PartNumber: 2, ETag: second.ETag },
      ],
    },
  }),
);

// The parts joined in part-number order, whichever order they arrived in.
console.log(completed.ETag);

const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "uploads-bucket", Key: "report.csv" }),
);

console.log(objectOut.Body);
```

The completed Object is an ordinary one. Every operation that reads an Object reads it, and the
system metadata the upload was started with (`ContentType` above) travels with it.

### The multipart ETag

Real S3 gives an Object uploaded in parts the ETag `<md5-of-the-part-md5s>-<partCount>`, and sim S3
gives it the same. A tool comparing content hashes checks for that `-N` suffix before trusting an
ETag. An Object assembled from parts therefore cannot report the MD5 of the joined bytes. The two
are different values.

`PutObject`, `GetObject`, `HeadObject` and both list operations all report the same one.

### Abandoning an upload

`AbortMultipartUploadCommand` discards the parts. Nothing was ever under the key, and the Bucket is
left as the upload found it. An unfinished upload puts no Object anywhere, and its parts are
invisible to a listing.

`ListMultipartUploadsCommand` reports what a Bucket has in flight, and `ListPartsCommand` reports the
parts stored against one upload. Both are how a cleanup finds an upload that stalled.

### Event notifications

A completed upload raises `s3:ObjectCreated:CompleteMultipartUpload`. A single-request upload raises
`s3:ObjectCreated:Put`, and real S3 keeps the two apart. `s3:ObjectCreated:*` covers both. See
[Event notifications](#event-notifications).

### Limitations

- `UploadPartCopy` is left out. It copies a byte range from another Object into an upload.
  `CopyObject` copies a whole Object, and is simulated. See [Copying Objects](#copying-objects).
- Parts are held in memory, whatever storage the Bucket uses. A Bucket backed by a mounted directory
  writes whole files and has nowhere to put half of one.
- Real S3 requires every part except the last to be at least five megabytes, and answers
  `EntityTooSmall` for one that is not. Sim S3 takes a part of any size.
- A listing of uploads or of parts comes back on one page. `MaxUploads`, `MaxParts`, the markers that
  page them, and `Delimiter` are all left out.
- No caller has to abort an upload. An `AbortIncompleteMultipartUpload` lifecycle rule abandons one
  the clock has left unfinished for long enough, and takes its parts with it. See
  [Lifecycle configuration](#lifecycle-configuration).

## Reading part of an Object

`GetObjectCommand` takes a `Range` and answers with the bytes it names. A client downloading a large
Object asks for its pieces at once and writes each response at the offset it asked for. `aws s3 cp`
downloads that way above eight megabytes.

```typescript sim-s3-ranged-read
/**
 * Reading part of a simulated S3 Object.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports-bucket" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports-bucket",
    Key: "quarter.csv",
    Body: "region,revenue\neu-west-2,1200\n",
  }),
);

const header = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "reports-bucket",
    Key: "quarter.csv",
    Range: "bytes=0-13",
  }),
);

// The first fourteen bytes, which are "region,revenue".
console.log(header.Body);
// 14
console.log(header.ContentLength);
// "bytes 0-13/30"
console.log(header.ContentRange);
```

`ContentLength` counts the bytes being sent, and `ContentRange` says which bytes of the Object they
are, in the `bytes <start>-<end>/<size>` form real S3 answers with. The `ETag` is the whole Object's.
A client reading an Object in pieces compares it across them to see whether the Object changed
underneath it.

Three forms are read:

- `bytes=0-499` takes the first five hundred bytes.
- `bytes=500-` takes everything from byte 500 to the end.
- `bytes=-500` takes the last five hundred bytes.

A range running past the end of the Object stops at the last byte, and a client that guessed the
size gets what there is. A range starting past the end raises `InvalidRange`, under the name and the
416 status real S3 gives it. A `Range` sim S3 cannot read (several ranges at once, or a unit other
than bytes) is ignored, and the whole Object comes back under a `200`.

Over a served endpoint, a ranged read answers `206 Partial Content` with a `content-range` header.
Both the S3 REST endpoint and an endpoint URL a client is pointed at answer the same way. See
[Serve simulated S3 on localhost](#serve-simulated-s3-on-localhost).

### Limitations

- `Range` on `HeadObject` is left out. A HEAD describes the whole Object however it is asked about,
  over the SDK and over a served endpoint alike.
- `If-Range` is left out. A ranged read is answered without comparing the Object against the entity
  tag or the date the client held.
- `PartNumber` is left out. A read names the bytes it wants, and the part they were uploaded in is
  not something it can ask for.

## Copying Objects

`CopyObjectCommand` reads one Object and writes its bytes under another key, in the same Bucket or
in another one. A move and a rename are both a copy followed by a `DeleteObjectCommand`, and an
archive is a copy on its own.

`CopySource` names the source as `sourceBucket/sourceKey`, URL-encoded, and a leading slash on it is
accepted. Everything after the first slash is the key. A key with slashes of its own needs nothing
done to it.

```typescript sim-s3-copy-object
/**
 * Copying an Object between simulated S3 Buckets.
 */

import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "inbox-bucket" }));
await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive-bucket" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "inbox-bucket",
    Key: "report.pdf",
    Body: "quarterly figures",
    ContentType: "application/pdf",
  }),
);

const copy = await simS3.copyObject(
  new CopyObjectCommand({
    Bucket: "archive-bucket",
    Key: "2026/report.pdf",
    CopySource: "inbox-bucket/report.pdf",
  }),
);

console.log(copy.CopyObjectResult?.ETag);
console.log(copy.CopyObjectResult?.LastModified);

// The copy carries the source's content type, because MetadataDirective
// defaults to COPY. Deleting the source turns the copy into a move.
await simS3.deleteObject(
  new DeleteObjectCommand({ Bucket: "inbox-bucket", Key: "report.pdf" }),
);
```

A copy authorizes as two decisions. `s3:GetObject` on the source Object and `s3:PutObject` on the
destination Object, each against its own Bucket policy. A caller holding one and not the other gets
`AccessDenied`.

`MetadataDirective` says where the copy's metadata comes from. The default, `COPY`, carries the
source's content type, cache control and user metadata across. `REPLACE` takes all of it from the
request and leaves the source's behind. A copy of an Object onto itself under `REPLACE` is how an
Object's metadata gets corrected without uploading its bytes again.

The destination Bucket raises `s3:ObjectCreated:Copy`, and `s3:ObjectCreated:*` covers it. See
[Event notifications](#event-notifications).

Copying an Object onto itself without `REPLACE` is refused with `InvalidRequest`, as real S3 refuses
it. The copy would leave the Object exactly as it found it.

### Over a served endpoint

Real S3 states a copy as a `PUT` on the destination carrying an `x-amz-copy-source` header and an
empty body. The served endpoint reads that header and runs the operation an in-process caller
reaches. `aws s3 cp` and `aws s3 mv` between two served Buckets then behave as they do against real
S3, for a file under the CLI's eight-megabyte multipart threshold.

```bash
aws s3 cp ./report.pdf s3://inbox/report.pdf
aws s3 mv s3://inbox/report.pdf s3://archive/2026/report.pdf
aws s3 ls s3://archive/2026/
```

The source is decoded one key segment at a time, the way a key in the request path is, and
`x-amz-metadata-directive` carries `MetadataDirective`. A finished copy answers with the
`CopyObjectResult` document holding the ETag and the write time.

Real S3 answers a failed copy with `200` and an error document in the body (it has to start sending
the response while the bytes are still moving). Sim S3 copies in memory and answers with the status
the error maps to, and an SDK raises it as it raises any other S3 failure.

See [Serve simulated S3 on localhost](#serve-simulated-s3-on-localhost) for setting an endpoint up.

### Limitations

- `UploadPartCopy` is left out. An Object cannot be copied into a multipart upload. A served
  endpoint refuses one with `NotImplemented` rather than storing an empty part. The `aws` CLI
  switches to it above eight megabytes, and a move of a file that size is refused.
- Both Buckets have to belong to the same simulated S3. A copy across Accounts or Regions is left
  out.
- A presigned copy is left out, and so is a copy reaching a Bucket through simulated CloudFront.
- `CopySourceIfMatch`, `CopySourceIfNoneMatch`, `CopySourceIfModifiedSince` and
  `CopySourceIfUnmodifiedSince` are ignored. A conditional copy happens whatever the condition
  says.
- `ACL` is ignored. Sim S3 models no Object ACL.
- A `versionId` in `CopySource` is refused with `NotImplemented`.
- A copy of an Object that was uploaded in parts gets a plain ETag rather than the multipart form.
  Real S3 does the same for a copy under five gigabytes, because it rewrites the bytes as one
  part.

## Deleting Objects

Use `DeleteObjectCommand` to remove one Object, and `DeleteObjectsCommand` to remove several in one
request. Both are authorized against `s3:DeleteObject` on the Object ARN. A caller allowed to read a
Bucket cannot empty it.

```typescript sim-s3-delete-object
/**
 * Deleting Objects from a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "uploads-bucket",
  }),
);

for (const key of ["receipt.pdf", "invoice.pdf", "notes.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "uploads-bucket",
      Key: key,
      Body: "file contents",
    }),
  );
}

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "uploads-bucket",
    Key: "receipt.pdf",
  }),
);

const batchOutput = await simS3.deleteObjects(
  new DeleteObjectsCommand({
    Bucket: "uploads-bucket",
    Delete: {
      Objects: [{ Key: "invoice.pdf" }, { Key: "notes.txt" }],
    },
  }),
);

const removedObjects = batchOutput.Deleted ?? [];
for (const removed of removedObjects) {
  console.log(removed.Key);
}

const refusedObjects = batchOutput.Errors ?? [];
for (const refused of refusedObjects) {
  console.log(refused.Key, refused.Code);
}
```

Deletion is idempotent, as it is in real S3. Deleting a key the Bucket never held succeeds, and
`DeleteObjects` reports it among the keys it deleted. Deleting from a Bucket that was never created
raises `NoSuchBucket`.

`DeleteObjects` authorizes each key on its own and carries on through the batch. A key the caller may
not delete appears in `Errors` with the code `AccessDenied`, while the rest are still removed and
reported in `Deleted`. Setting `Quiet: true` leaves `Deleted` out of the response, so only the
failures come back.

### Limitations

- `VersionId` and `MFA` are ignored on a `DeleteObjects` request. A versioned Bucket writes a delete
  marker over each key and reports it per key under `DeleteMarker` and `DeleteMarkerVersionId`, and
  removing a named version needs `DeleteObjectCommand`. See
  [Object versioning](#object-versioning).
- A request naming no Objects, or more than the thousand S3 accepts, is refused with `MalformedXML`
  before anything is deleted.
- A Bucket using filesystem-backed storage refuses deletion. See
  [Filesystem-backed Bucket storage](#filesystem-backed-bucket-storage).

## Object versioning

A versioned Bucket keeps every write of a key instead of overwriting it, and answers a delete with a
marker rather than removing anything. Turn it on with `PutBucketVersioningCommand`, or with
`VersioningConfiguration` on an `AWS::S3::Bucket` resource.

```typescript sim-s3-object-versioning
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "history" },
      },
    },
  },
});

// Written before the Bucket was versioned, so this one takes the null version
// id, as it does in real S3. A template declaring VersioningConfiguration
// gives even the first write a version id of its own instead.
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: JSON.stringify({ words: ["好"] }),
  }),
);

await simS3.putBucketVersioning(
  new PutBucketVersioningCommand({
    Bucket: "history",
    VersioningConfiguration: { Status: "Enabled" },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: JSON.stringify({ words: [] }),
  }),
);

// The write did not overwrite anything. Both versions are listed, newest
// first, with IsLatest on the one a plain read answers with.
const listed = await simS3.listObjectVersions(
  new ListObjectVersionsCommand({ Bucket: "history", Prefix: "snapshots/" }),
);

console.log(listed.Versions?.map((version) => version.VersionId));
// [ "<a version id>", "null" ]

// Recovery is a read of the earlier version and a write of it back.
const earlier = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    VersionId: "null",
  }),
);

const recovered = await Array.fromAsync(earlier.Body ?? []);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: Buffer.concat(recovered),
  }),
);

// A delete writes a marker over the key rather than removing anything, and
// deleting the marker by its own id brings the Object back.
const deleted = await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
  }),
);

console.log(deleted.DeleteMarker); // true

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    VersionId: deleted.VersionId,
  }),
);
```

`PutObjectCommand`, `CopyObjectCommand` and `CompleteMultipartUploadCommand` each report the
`VersionId` they wrote under. `GetObjectCommand` and `HeadObjectCommand` take one and read that
version, and report the version they read. `DeleteObjectCommand` takes one and removes that version
for good.

`ListObjectVersionsCommand` reports the Objects under `Versions` and the delete markers under
`DeleteMarkers`, keys in ascending order and each key's versions newest first. `IsLatest` marks the
version a read without a `VersionId` answers with. `ListObjectsV2Command` reports the current
version of each key alone, and a key hidden behind a delete marker is absent from it.

Both lists are paged together, so `MaxKeys` counts an Object and a marker alike. A truncated listing
carries `NextKeyMarker` and `NextVersionIdMarker`, which the next request sends back as `KeyMarker`
and `VersionIdMarker`. See [Walking a truncated listing](#walking-a-truncated-listing) for the page
size and how to lower it.

### Enabling versioning over a Bucket that already holds Objects

Real S3 gives an Object written before the configuration arrived the version id `null`, and
simulated S3 does the same. That Object is the current version of its key, reads back under the
literal string `null`, and stays where it is when a later write pushes it out of being current.

A Bucket keeping no versions still answers `ListObjectVersionsCommand`, reporting each Object once
under the null version id and marked latest. That is what real S3 answers for an unversioned Bucket,
and it means the operation is safe to call before deciding whether the Bucket is versioned.

### Suspending versioning

`Status: "Suspended"` stops new versions being made and discards none of the ones already there. An
Object written while suspended takes the null version id and replaces whatever else holds it, so a
run of writes shares one version between them. Every version written while versioning was enabled
stays readable by its own id.

There is no way back to unversioned. Real S3 has no request for it, and
`GetBucketVersioningCommand` reports no status at all for a Bucket nobody has configured, which is
what separates one from a Bucket whose versioning was suspended.

### Event notifications

A delete on a versioned Bucket raises `s3:ObjectRemoved:DeleteMarkerCreated` rather than
`s3:ObjectRemoved:Delete`, carrying the marker's version id. Removing a version by its own id raises
`s3:ObjectRemoved:Delete` with that version id. A record from a versioned Bucket carries
`s3.object.versionId`, and one from a Bucket without versioning leaves the field out.

### Limitations

- MFA delete is refused with `NotImplemented` rather than stored. Nothing here could enforce it, and
  a Bucket reporting a protection it does not apply is worse than one that says so. `MFADelete:
"Disabled"` is taken, and any other value is refused with `InvalidArgument`.
- A `versionId` in a `CopySource` is still refused with `NotImplemented`. A copy reads the current
  version.
- `NoncurrentVersionTransitions` is stored and unread, because storage classes are left out. An
  `Expiration` rule expires the current version behind a delete marker, as real S3 does, and raises
  nothing. A `NoncurrentVersionExpiration` rule bounds the history, and `ExpiredObjectDeleteMarker`
  removes a marker left bare. See
  [Bounding the history a versioned Bucket keeps](#bounding-the-history-a-versioned-bucket-keeps).
- The `?versioning` and `?versions` sub-resources are refused over the served S3 REST endpoint.
  Versioning is reachable through the SDK and through a template.
- A Bucket mounted on a filesystem directory refuses the deletion a delete marker asks for, the way
  it refuses `DeleteObject`. See [Filesystem-backed Bucket storage](#filesystem-backed-bucket-storage).

## Object Lock

Object Lock holds a version of an Object against a delete. A version can be held by a retention
period, by a legal hold or by both, and a delete naming a held version is answered with
`AccessDenied`. One way past exists and it is narrow. A `GOVERNANCE` retention period gives way to a
request carrying `BypassGovernanceRetention` from a caller allowed to use it. A `COMPLIANCE` period
and a legal hold hold against everyone, the account root included. Turn it on with `PutObjectLockConfigurationCommand`, or with
`ObjectLockEnabled` on an `AWS::S3::Bucket` resource.

Object Lock holds a version, and versioning has to be on underneath it. Turning it on over a Bucket
with versioning off is refused with `InvalidBucketState`, as real S3 refuses it, and a template
declaring Object Lock without `VersioningConfiguration` fails the stack. See
[Object versioning](#object-versioning) for what versioning itself changes.

```typescript sim-s3-object-lock
/**
 * A reader's history in a Bucket nothing in the account can delete from.
 */

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

// Versioning goes on underneath Object Lock. Every version written into this
// Bucket is then retained for seven days from the write.
const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "reader-history",
          VersioningConfiguration: { Status: "Enabled" },
          ObjectLockEnabled: true,
          ObjectLockConfiguration: {
            ObjectLockEnabled: "Enabled",
            Rule: { DefaultRetention: { Mode: "COMPLIANCE", Days: 7 } },
          },
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

const written = await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    Body: JSON.stringify({ words: ["好"] }),
  }),
);

const held = await simS3.headObject(
  new HeadObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    VersionId: written.VersionId,
  }),
);

console.log(held.ObjectLockMode); // "COMPLIANCE"

try {
  await simS3.deleteObject(
    new DeleteObjectCommand({
      Bucket: "reader-history",
      Key: "events/reader-1.json",
      VersionId: written.VersionId,
      BypassGovernanceRetention: true,
    }),
  );
} catch (error) {
  // AccessDenied. A compliance period gives way to nobody, and naming the
  // bypass changes nothing.
  console.log((error as Error).name);
}

// The period lapses because simulated time passed it.
await simAws.clock().advanceBy({ days: 8 });

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    VersionId: written.VersionId,
  }),
);
```

The retention boundary is a pure function of simulated time, read off the clock every time a delete
asks. Advancing the clock past `RetainUntilDate` is all a test does to watch a held version become
deletable. See [Controlling time](https://yulinsim.dev/time/ "Controlling time").

`GetObject` and `HeadObject` report `ObjectLockMode` and `ObjectLockRetainUntilDate` for a version
under a retention period, and `ObjectLockLegalHoldStatus` for one under a hold. A version free of
both leaves all three out.

### Retention modes

`GOVERNANCE` and `COMPLIANCE` differ over who can get out of them. A governance period gives way to a
delete carrying `BypassGovernanceRetention` from a caller holding `s3:BypassGovernanceRetention`,
which sim IAM authorizes as a decision of its own alongside the `s3:DeleteObject` the delete already
needed. Holding the permission and using it are separate. A delete that leaves the flag off is
refused whatever the caller may do.

A compliance period gives way to nobody, the account root included. `PutObjectRetentionCommand`
follows the same split. A compliance period can be extended in the same mode and that is all, since
shortening one would end the guarantee early and turning one into a governance period would hand the
version to the first caller holding the bypass permission. A governance period can be shortened, or
turned into a compliance one, by a request that bypasses it.

### Legal holds

`PutObjectLegalHoldCommand` turns the hold on a version on and off. A hold has no period to wait out.
Only a `Status: "OFF"` takes one off, which is what makes a hold the thing to reach for when the end
of the retention is unknowable in advance. A version can carry a hold and a retention period at
once, and either one on its own refuses the delete.

### Default retention

A `DefaultRetention` under `Rule` retains every version written after it, counted from the write, so
two versions of one key written a day apart are held until two different instants. It takes `Days` or
`Years` and refuses both together, a year is 365 days, and the longest one real S3 takes is a hundred
years. A Bucket with Object Lock on and no
default leaves each version to whatever requests name it.

### From a CloudFormation template

`ObjectLockEnabled` and `ObjectLockConfiguration` are applied through
`PutObjectLockConfigurationCommand`, so a template and an SDK caller are validated identically. CDK's
`objectLockEnabled` and `objectLockDefaultRetention` synthesise both. `ObjectLockConfiguration`
without `ObjectLockEnabled: true` fails the resource, as real CloudFormation refuses it, because a
Bucket created around the property would report a default retention it never applied.

### Limitations

- `GetObjectRetentionCommand` and `GetObjectLegalHoldCommand` are absent. A version reports both
  through `GetObject` and `HeadObject`.
- `PutObjectCommand` takes no `ObjectLockMode`, `ObjectLockRetainUntilDate` or
  `ObjectLockLegalHoldStatus`. A version is held by the Bucket's default retention and by
  `PutObjectRetentionCommand` and `PutObjectLegalHoldCommand` afterwards.
- `CreateBucketCommand` takes no `ObjectLockEnabledForBucket`. Turn versioning on, then Object Lock.
- `DeleteObjectsCommand` names keys and no versions, so a batch delete writes delete markers and
  reaches no held version. See [Deleting Objects](#deleting-objects).
- The `?object-lock`, `?retention` and `?legal-hold` sub-resources are refused over the served S3
  REST endpoint. Object Lock is reachable through the SDK and through a template.
- A Bucket policy setting minimum and maximum allowable retention periods is left out. The only
  bound applied is the hundred years real S3 caps a `DefaultRetention` at. A `RetainUntilDate` on a
  single version is taken as given, however far ahead it names.
- `S3 Batch Operations` applying retention across a manifest is left out.

## Event notifications

A simulated S3 Bucket can notify a simulated Lambda function, a simulated SQS queue or a simulated
SNS topic when an Object is created or removed. The configuration is applied with
`PutBucketNotificationConfigurationCommand` and read back with
`GetBucketNotificationConfigurationCommand`.

The destination's own policy decides whether S3 may reach it. That is the function's resource
policy, the queue's `Policy` attribute, or the topic's. It is checked when the configuration is
applied, and again for every event, as real S3 does.

```typescript sim-s3-event-notifications
/**
 * Notifying a simulated Lambda function when an Object is created.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const thumbnailerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`;

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "thumbnailer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ThumbnailerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
        console.log(event.Records[0].eventName, event.Records[0].s3.object.key);

        return "thumbnailed";
      }),
    },
  }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "thumbnailer",
    StatementId: "AllowS3",
    Action: "lambda:InvokeFunction",
    Principal: "s3.amazonaws.com",
    SourceArn: "arn:aws:s3:::uploads",
    SourceAccount: simAws.defaultAccountId,
  }),
);

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Id: "thumbnail-raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: thumbnailerArn,
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
        },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

The event types a configuration can name are `s3:ObjectCreated:*`, `s3:ObjectCreated:Put`,
`s3:ObjectRemoved:*` and `s3:ObjectRemoved:Delete`. Any other S3 event type is refused by name rather
than stored and never raised.

A CDK [`BucketDeployment`](https://yulinsim.dev/services/cloudformation/#cdk-s3-bucketdeployment) raises
both. It copies its files in one Object at a time, so each file the deployment writes raises
`ObjectCreated:Put`, and each Object a pruning deployment removes raises `ObjectRemoved:Delete`. The
sync it stands in for raises the same two in AWS.

A configuration can filter on an object key prefix, a suffix, or both. Two configurations that share
an event type and whose filters could both match the same key are refused with `InvalidArgument`, as
real S3 refuses them. Overlapping prefixes are fine when the suffixes do not overlap, so one function
can take the `.jpg` files under a prefix while another takes the `.png` files under the same one.
The rule applies across the destination groups. A function and a queue that both want the same
event are refused as readily as two functions.

`PutBucketNotificationConfigurationCommand` replaces the whole configuration rather than adding to
it. `GetBucketNotificationConfigurationCommand` answers an empty configuration for a Bucket that has
none. Note that the response carries the destination groups at the top level, while the request nests
them under `NotificationConfiguration`:

```typescript
const read = await simAws
  .s3()
  .getBucketNotificationConfiguration(
    new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
  );
const configurations = read.LambdaFunctionConfigurations ?? [];
```

The two commands are authorized as `s3:PutBucketNotification` and `s3:GetBucketNotification`. Those
are the real IAM action names, and they do not match the API names.

### To a Lambda version or alias

A `LambdaFunctionArn` can carry a version number or an alias name on the end, and the events go to
the version that qualifier names. The permission it needs is one made on the same qualifier, which
`AddPermission` takes as a `Qualifier`:

```typescript sim-s3-notification-lambda-alias
/**
 * Notifying a simulated Lambda alias, which runs the version it points at.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const thumbnailerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`;

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "thumbnailer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ThumbnailerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "thumbnailed";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "thumbnailer" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "thumbnailer",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

// The grant is made on the alias, which is the resource the notification names.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "thumbnailer",
    Qualifier: "live",
    StatementId: "AllowS3",
    Action: "lambda:InvokeFunction",
    Principal: "s3.amazonaws.com",
    SourceArn: "arn:aws:s3:::uploads",
    SourceAccount: simAws.defaultAccountId,
  }),
);

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Id: "thumbnail-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: `${thumbnailerArn}:live`,
        },
      ],
    },
  }),
);

await simAws
  .s3()
  .putObject(
    new PutObjectCommand({ Bucket: "uploads", Key: "cat.jpg", Body: "cat" }),
  );
await simAws.backgroundTasksComplete();
```

`UpdateAlias` moves what the notification reaches, and the configuration stays as it is. A qualifier
naming no version and no alias is refused where the configuration is applied, the way a missing
function is.

### To an SQS queue

A `QueueConfigurations` entry names a queue by ARN. The whole `Records` document arrives as one
message body, and a consumer parses `record.body` to get at the event. Put a Lambda event source
mapping on the queue and the chain runs end to end after one `backgroundTasksComplete()`.

The queue's `Policy` attribute has to allow `sqs:SendMessage` for the `s3.amazonaws.com` service
principal. S3 supplies `aws:SourceArn` and `aws:SourceAccount`. The `ArnLike` condition CDK's
`SqsDestination` writes and the `StringEquals aws:SourceAccount` guard AWS documents are both
satisfied.

```typescript sim-s3-sqs-notification
/**
 * An Object event reaching a Lambda function through an SQS queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));

// The queue policy is the whole of what admits S3, which owns no identity
// policies anywhere.
await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      }),
    },
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "UploadConsumerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "UploadConsumerRole",
    PolicyName: "ConsumeUploads",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "upload-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        for (const record of event.Records) {
          // The S3 event document is the SQS message body, so it is parsed
          // out of the record rather than being the event itself.
          const document = JSON.parse(record.body) as S3EventDocument;

          console.log(document.Records[0].s3.object.key); // "raw/cat.jpg"
        }
      }),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "upload-consumer",
  }),
);

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      QueueConfigurations: [
        {
          Id: "raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          QueueArn: queueArn,
        },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// One wait covers the delivery to the queue and the poll that follows it.
await simAws.backgroundTasksComplete();
```

The queue has to be in the Bucket's Region, as real S3 requires. It can be in another Account, since
its own policy and its own Account's IAM are what admit the Bucket. A FIFO queue is refused by name.

### To an SNS topic

A `TopicConfigurations` entry names a topic by ARN. The whole `Records` document is published as the
SNS `Message`, with a `Subject` of `Amazon S3 Notification`, as real S3 publishes it. A queue
subscribed to the topic therefore has two envelopes to reach through. Parse the message body for the
SNS envelope, then parse its `Message` for the S3 event.

The topic's `Policy` attribute has to allow `sns:Publish` for the `s3.amazonaws.com` service
principal. S3 supplies `aws:SourceArn` and `aws:SourceAccount`. The `ArnLike` condition CDK's
`SnsDestination` writes and the `StringEquals aws:SourceAccount` guard AWS documents are both
satisfied.

```typescript sim-s3-sns-notification
/**
 * An Object event reaching a queue through an SNS topic.
 */

import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateTopicCommand,
  SetTopicAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

interface SnsEnvelope {
  Subject: string;
  Message: string;
}

interface S3EventDocument {
  Records: [{ eventName: string; s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const { defaultRegionName: region, defaultAccountId: account } = simAws;
const bucketArn = "arn:aws:s3:::uploads";
const topicArn = `arn:aws:sns:${region}:${account}:uploads`;
const queueArn = `arn:aws:sqs:${region}:${account}:uploads-queue`;

const { TopicArn } = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "uploads" }));

// The topic policy is the whole decision, because S3 owns no identity
// policies. S3 supplies aws:SourceArn, so the grant names one Bucket.
await simAws.sns().setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": bucketArn } },
        },
      ],
    }),
  }),
);

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "uploads-queue" }));

await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": topicArn } },
          },
        ],
      }),
    },
  }),
);

await simAws
  .sns()
  .subscribe(
    new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
  );

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      TopicConfigurations: [
        {
          Id: "raw-uploads",
          Events: ["s3:ObjectCreated:*"],
          TopicArn,
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
        },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// One wait covers the publish to the topic and the delivery to the queue.
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// Two envelopes to reach through: the SNS envelope, then the S3 event.
const envelope = JSON.parse(received.Messages?.[0]?.Body ?? "") as SnsEnvelope;

console.log(envelope.Subject); // "Amazon S3 Notification"

const event = JSON.parse(envelope.Message) as S3EventDocument;

console.log(event.Records[0].s3.object.key); // "raw/cat.jpg"
```

The topic has to be in the Bucket's Region, as real S3 requires. It can be in another Account, since
its own policy and its own Account's IAM are what admit the Bucket. A FIFO topic is refused by name.

The publish goes through the ordinary `Publish` path, and the topic's own subscriptions take it from
there. That means a topic destination reaches everything the topic reaches, and a subscribed queue is
two hops from the Object that was written. One `backgroundTasksComplete()` covers both.

### From a CloudFormation template

The `NotificationConfiguration` property of `AWS::S3::Bucket` deploys through the same
`PutBucketNotificationConfiguration` path, and a template and an SDK caller get identical validation.
CloudFormation names the same configuration differently in several places. It writes
`LambdaConfigurations` where the SDK writes `LambdaFunctionConfigurations`, a single `Event` string
where the SDK takes an `Events` list, `Function` for `LambdaFunctionArn`, `Queue` for `QueueArn`,
`Topic` for `TopicArn`, and `Filter.S3Key.Rules` for `Filter.Key.FilterRules`. `QueueConfigurations`
and `TopicConfigurations` are the names both spell the same way. Yulin reads the CloudFormation names
and refuses the others, so a template using the SDK spelling fails the stack. An unfiltered
configuration would deploy otherwise.

```typescript sim-s3-cfn-event-notification
/**
 * Configuring Bucket event notifications from a CloudFormation template.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      Thumbnailer: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "thumbnailer",
          Role: { "Fn::GetAtt": ["ThumbnailerRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: { ZipFile: "exports.handler = async () => 'thumbnailed';" },
        },
      },
      ThumbnailerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "thumbnailer-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      ThumbnailerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
          Principal: "s3.amazonaws.com",
          SourceAccount: { Ref: "AWS::AccountId" },
          SourceArn: "arn:aws:s3:::uploads",
        },
      },
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        DependsOn: ["ThumbnailerPermission"],
        Properties: {
          BucketName: "uploads",
          NotificationConfiguration: {
            LambdaConfigurations: [
              {
                Event: "s3:ObjectCreated:*",
                Function: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
                Filter: {
                  S3Key: { Rules: [{ Name: "prefix", Value: "raw/" }] },
                },
              },
            ],
          },
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

Two things in that template are there because real CloudFormation needs them, and simulated
CloudFormation needs them for the same reasons. The Bucket names itself, where CloudFormation would
otherwise name it, and the permission names the Bucket by ARN literal, where `Fn::GetAtt` would
otherwise give it. Written the other way round, the Bucket needs the function's ARN and the
permission needs the Bucket's, a circular dependency. The `DependsOn` then puts the permission in
place before S3 validates the destination the notification names.

S3 generates the configuration id, because CloudFormation has no property for stating one. Read it
back with `GetBucketNotificationConfigurationCommand` if a test needs it.

### From a CDK app

`bucket.addEventNotification(...)` deploys through simulated CloudFormation. CDK writes a
`Custom::S3BucketNotifications` resource for it rather than the `AWS::S3::Bucket`
`NotificationConfiguration` property. The resource carries the same request
`PutBucketNotificationConfigurationCommand` takes, alongside the `AWS::Lambda::Permission` that lets
S3 invoke the function. Yulin applies that request through the same command path an SDK caller
reaches, and a configuration is validated the same way whichever it arrives by.

`SqsDestination` and `SnsDestination` write their entry into the same resource, alongside the
`AWS::SQS::QueuePolicy` or `AWS::SNS::TopicPolicy` that grants S3 access. Both of those deploy, as
does the `AWS::SNS::Topic` beside them. A stack whose Bucket notifies a topic needs nothing set up
by hand.

Deploy into an Account and Region matching the ones the CDK app synthesized for. The `SourceAccount`
on the permission CDK writes beside the notification is a synth-time literal. A stack deployed into
another Account leaves S3 unable to validate the destination, and the stack fails.

```typescript sim-s3-cdk-event-notification
/**
 * Deploying a CDK Bucket event notification into simulated AWS.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The Account and Region the CDK app synthesized for.
const scope = simAws.account("111111111111").region("eu-west-2");

await scope
  .cloudFormation()
  .deployTemplateFile("cdk.out/TestStack.template.json");

await scope.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
```

CDK's own provider function for this resource is written in Python, so simulated CloudFormation skips
it on its runtime and Yulin does the work the function would have done. The `ServiceToken` naming it
is read and ignored.

A resource carrying `Managed: false` is refused, and the stack fails. CDK writes it for a Bucket the
app imported rather than declared. It asks S3 to merge the configuration with the configurations
already on the Bucket, where simulated S3 only replaces, so applying it as written would drop
configurations that survive on real AWS. Declare the Bucket in the same stack to
get a managed notification configuration.

### What arrives at the destination

A function is invoked with the `Records` document real S3 sends. A queue gets the same document as
one message body, and a topic gets it as the published `Message`. One event produces one record.

Creation records carry the Object's `size` and its `eTag`, the MD5 of the bytes as it is for an
Object real S3 stored in one part. Removal records leave both out, because the Object they describe
is gone. Both carry a `sequencer`, which orders the events for one object key. The object key is
form-URL-encoded, so `red flower.jpg` arrives as `red+flower.jpg`.

`eventTime` comes from the simulation's clock, and a frozen clock produces a fixed timestamp.

The document is typed as `SimS3Event`, with `SimS3EventRecord` for one record, and a handler can be
written against it. Assigning it to the `aws-lambda` typings package's `S3Event` fails,
deliberately. That package declares `Records` mutable and requires `s3.object.size` and `eTag`, which a
removal record leaves out. A handler typed against `S3Event` still receives this
document at runtime, and typing it as `SimS3Event` is what describes what actually arrives.

### Making an event notification without a Bucket

A test of the handler on its own, with no Bucket and no configuration, still has to pass it a whole
event. `s3NotificationEventFactory` makes one, and `s3NotificationEventRecordFactory` makes the
records in it:

```typescript sim-s3-notification-event-factory
/**
 * Making an S3 event notification to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import { s3NotificationEventFactory, type SimS3Event } from "@kensio/yulin/s3";

function thumbnailKeys(event: SimS3Event): readonly string[] {
  return event.Records.filter((record) =>
    record.eventName.startsWith("ObjectCreated"),
  ).map((record) => `${record.s3.bucket.name}/${record.s3.object.key}`);
}

const uploaded = s3NotificationEventFactory.make({
  Records: [
    { s3: { bucket: { name: "uploads" }, object: { key: "cat.jpg" } } },
  ],
});

// [ 'uploads/cat.jpg' ]
console.log(thumbnailKeys(uploaded));

// A removal is a variation worth naming, since it reports no Object detail.
const objectRemovedFactory = new VariantFactory(s3NotificationEventFactory, {
  Records: [{ eventName: "ObjectRemoved:Delete" }],
});

// []
console.log(thumbnailKeys(objectRemovedFactory.make()));
```

The default is the single record one Object event produces, all real S3 delivers to a function at
once. What a record says in more than one place is computed from the rest. The Bucket ARN is the ARN
of the Bucket named, and a removal carries no `size` and no `eTag` where a creation carries both.
The key is carried as a record carries it, form-URL-encoded, and a key with a space in it goes in as
`red+flower.jpg`.

The [event factories page](https://yulinsim.dev/factories/ "Test factories for AWS event shapes usage docs")
covers what these have in common with the factories for the other event shapes.

### When delivery fails

Real S3 tells the caller who wrote the Object nothing about a delivery, and the simulator says as
little. A handler that throws leaves the `PutObject` successful and `backgroundTasksComplete()`
resolved. The outcome is still readable:

```typescript
for (const failure of simAws.s3().getNotificationDeliveryFailures()) {
  console.log(failure.destinationArn, failure.reason, failure.wasRefused);
}
```

A handler that threw is also warned about on the console, once per destination and cause. A
destination that refused the event, because its resource policy no longer admits the Bucket, is
recorded without a warning.

A handler that writes back into the Bucket that triggered it notifies itself forever, and in process
there is nothing to slow it down. Filter the configuration by prefix or suffix, so the handler's own
writes fall outside it. Without that, the simulation stops after a thousand deliveries and
`backgroundTasksComplete()` raises an error naming the Bucket.

### Limitations

- A Lambda function, an SQS queue and an SNS topic are the destinations. EventBridge is refused by
  name.
- A destination goes where the group it was declared in says, and its ARN has no say. A queue ARN
  under `LambdaFunctionConfigurations` is refused for failing to be a function ARN, and never
  delivered to as a queue.
- Six event types are raised: `s3:ObjectCreated:Put`, `s3:ObjectCreated:Copy`,
  `s3:ObjectCreated:CompleteMultipartUpload`, `s3:ObjectRemoved:Delete`,
  `s3:ObjectTagging:Put` and `s3:ObjectTagging:Delete`. `Post`, `DeleteMarkerCreated`, the
  `ObjectRestore:*`, `Replication:*` and `LifecycleExpiration:*` families, `LifecycleTransition`,
  `IntelligentTiering`, `ObjectAcl:Put` and `ReducedRedundancyLostObject` are refused by name.
  `s3:ObjectCreated:*` expands to the three creations, `s3:ObjectRemoved:*` to the one removal and
  `s3:ObjectTagging:*` to the two tagging events.
- `userIdentity.principalId` carries the caller's ARN rather than the `AIDA...` unique id real S3
  puts there. Simulated IAM has no unique-id namespace to draw one from, and an ARN is what a test
  would assert on. `requestParameters.sourceIPAddress` is the loopback address, because the request
  was made in this process, and the `responseElements` request ids are generated per event and match
  nothing.
- `eventVersion` is the version the S3 event message structure page documents now. AWS increments the
  minor version whenever it adds a field, so compare the major for equality and leave the whole
  string alone.
- `versionId` is absent from a record raised by a Bucket without versioning, as it is on real S3,
  and carried by one from a versioned Bucket. See [Object versioning](#object-versioning).
- A notification cannot be configured on a standalone `SimS3`. It has no other simulated services to
  notify, and no shared background scheduler for `backgroundTasksComplete()` to drain. Reach
  simulated S3 through `SimAws` instead.
- An `EventBridgeConfiguration` in an `AWS::S3::Bucket` `NotificationConfiguration` is refused by
  name, as it is for an SDK caller.
- `Managed: false` on a `Custom::S3BucketNotifications` resource is refused outright, and an
  EventBridge destination in one is refused by name as it is for an SDK caller.
- A FIFO queue destination is refused by name, as real S3 refuses one. Simulated SQS has no FIFO
  queues either, and simulated SNS has no FIFO topics, so a FIFO topic destination is refused the
  same way.
- The KMS key policy statement CDK's `SqsDestination` writes for an encrypted queue is ignored.
  Queue encryption is left out.
- `mountBucketFilesystem(...)` replaces the storage with the directory, and a file written there by
  something other than S3 raises nothing. The watcher reports that the directory changed without
  naming the file, and comparing the whole key set on every reload is a larger change than this
  earns. A delete through S3 raises `ObjectRemoved:Delete` on a mount that
  [allows deletion](#deleting-the-files-under-a-mount).
- A topic destination publishes with no message attributes, since real S3 publishes none. The only
  thing on the message besides the event document is the `Amazon S3 Notification` subject.
- `s3:TestEvent` is left out. Real S3 puts one on a queue or topic when a configuration naming it is
  applied, carrying a flat `{Service, Event, Time, Bucket, RequestId, HostId}` document with no
  `Records` in it. Sending it here would make the simplest test two messages long and hand a
  consumer a body it cannot parse as an event. What the message exists to prove, that S3 may reach
  the destination, is simulated directly by the destination check.

## Buckets from CloudFormation

An `AWS::S3::Bucket` resource carries eight properties simulated S3 acts on. Those are `BucketName`,
`LifecycleConfiguration`, `NotificationConfiguration`, `ObjectLockConfiguration`,
`ObjectLockEnabled`, `PublicAccessBlockConfiguration`, `VersioningConfiguration` and
`WebsiteConfiguration`. See [Lifecycle configuration](#lifecycle-configuration) for the parts of a
rule that are read, [Object versioning](#object-versioning) for what versioning a Bucket changes, and
[Object Lock](#object-lock) for what holds a version once it is written.

A Bucket with no `BucketName` is named from the stack name, the logical ID and a tail derived from
both, lower cased as a bucket name has to be. A `SiteBucket` in `orders-stack` becomes
`orders-stack-sitebucket-` and twelve more characters, where real CloudFormation ends the name in
twelve random ones. The name is trimmed to the 63 characters a bucket name allows, and [the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
cover how the stack name and the logical ID share what is left.

Any other property is left out and recorded in
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without),
and the Bucket is created and the stack carries on. That matters because a Bucket deployed without
the replication or CORS configuration its template asked for looks configured and
behaves as though it were bare, and the failure that causes turns up somewhere else entirely. The
record is where a test checks which of those it is standing on. A property name `AWS::S3::Bucket`
never had is recorded the same way, and a typo leaves the stack standing.

One of the eight given in the wrong shape still fails the stack, and so does a `BucketName` that is
something other than a string. There is no Bucket to create under a name nothing else in the
template refers to.

A `ReplicationConfiguration` fails the stack as well, for a different reason. Replication is not
simulated and nothing acts on the property, and the value is still read for the constraints real S3
enforces on it. Those are a `Metrics.EventThreshold` with no `ReplicationTime` at `Status: Enabled`,
a rule stating a `Filter` without the `DeleteMarkerReplication`, `Priority` and `Status` that S3
requires alongside one, and a source Bucket whose template never enabled versioning. Real S3 answers
each of them with a 400 and CloudFormation rolls the stack back, and the CloudFormation resource
schema states none of them, so cfn-lint passes a template carrying any one. A deploy here that
reported them as working would be the last check between a repository and that rollback.

A configuration passing all three is recorded like any other skipped property. One that fails takes
the Bucket with it and is never recorded, because the Resource is refused before it is created.

`BucketEncryption` and `Tags` are read, ignored and left out of the record, because nothing this
simulator models can tell the difference. There is no simulated KMS, Object bytes are stored as they
arrive, and no simulated service reads a Bucket tag. CDK puts both on almost every Bucket it synthesizes, and
listing a difference no test could observe would only bury the ones that matter.

## Bucket policies

A Bucket policy is a resource policy stored on the Bucket. Sim IAM evaluates it alongside the
caller's identity policies whenever an Object command is authorized. A policy can grant access to a
principal that holds no identity policy at all, including an anonymous caller.

Apply one with `PutBucketPolicyCommand`, read it back with `GetBucketPolicyCommand`, and remove it
with `DeleteBucketPolicyCommand`. Each is authorized in its own right, against `s3:PutBucketPolicy`,
`s3:GetBucketPolicy` and `s3:DeleteBucketPolicy`.

In a CloudFormation template, a Bucket policy is a separate `AWS::S3::BucketPolicy` resource rather
than a property of `AWS::S3::Bucket`. CDK synthesizes one for `bucket.grantRead(...)`,
`grantPut(...)` and `addToResourcePolicy(...)`, and a template reaches it whether or not the app
mentions a Bucket policy itself. Sim CloudFormation attaches it through the same `PutBucketPolicy`
path an SDK call takes, and the document is validated and enforced identically either way.

```typescript sim-s3-bucket-policy
/**
 * Granting access to a simulated S3 Bucket with a Bucket policy.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  GetBucketPolicyCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();
const simS3 = simAws.s3();

// The principal the Bucket policy will name. It gets no identity policy, so
// the Bucket policy is the whole of its access.
const roleOut = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports" },
      },
      ReportsBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "ReportsBucket" },
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: roleOut.Role.Arn },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports/*",
              },
            ],
          },
        },
      },
    },
  },
});

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "q3/report.txt",
    Body: "quarterly numbers",
  }),
);

// The deployed policy authorizes the read.
const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
  { caller: { kind: "arn", arn: roleOut.Role.Arn } },
);

console.log(objectOut.Metadata);

// The same document comes back out as a JSON string.
const policyOut = await simS3.getBucketPolicy(
  new GetBucketPolicyCommand({ Bucket: "reports" }),
);

console.log(policyOut.Policy);
```

`GetBucketPolicyCommand` throws `NoSuchBucketPolicy` when the Bucket exists but has no policy, as
real S3 separates that from a missing Bucket. `DeleteBucketPolicyCommand` succeeds either way,
matching S3's idempotent behaviour.

A Bucket policy granting `Principal: "*"` is refused by default. See
[Block Public Access](#block-public-access) below.

### Missing keys and `s3:ListBucket`

What S3 answers for a missing Object depends on a second permission. A caller holding
`s3:GetObject` alone is answered `403 AccessDenied` for a key the Bucket does not hold, the same
answer it gets for a key it may not read. `s3:ListBucket` on the Bucket ARN is what buys
`404 NoSuchKey`.

Which keys a Bucket holds is what a listing tells you, and real S3 admits the absence only to a
caller that may list. A test written against a simulator that always answered `NoSuchKey` would
handle the absence on a path the deployed code never reaches.

```typescript sim-s3-missing-key-permission
/**
 * What simulated S3 answers for an Object that is not there.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

const readerCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportReader",
    PolicyName: "ReadReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports/*",
      },
    }),
  }),
);

const asReader = {
  caller: { kind: "arn", arn: readerCreation.Role.Arn },
} as const;

try {
  await simS3.getObject(
    new GetObjectCommand({ Bucket: "reports", Key: "q4/report.txt" }),
    asReader,
  );
} catch (error) {
  // AccessDenied, with a 403 status. This caller may not list the Bucket, and
  // S3 will not tell it whether the key is there.
  console.error("Read refused", error);
}

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportReader",
    PolicyName: "ListReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: "arn:aws:s3:::reports",
      },
    }),
  }),
);

try {
  await simS3.getObject(
    new GetObjectCommand({ Bucket: "reports", Key: "q4/report.txt" }),
    asReader,
  );
} catch (error) {
  // NoSuchKey, with a 404 status.
  console.error("Object missing", error);
}
```

An Object that is there is served on `s3:GetObject` alone. The listing permission only decides what
a caller is told about a key the Bucket does not hold.

Everything that reads through GetObject follows the same rule, including the served S3 endpoint, the
static website endpoint and a CloudFront S3 Origin. A site whose Bucket policy grants only
`s3:GetObject` answers 403 for a page it does not hold, and serves its custom error document with
that status. Adding `s3:ListBucket` on the Bucket ARN gives it the 404 an error document is usually
written for.

### Where a request came from

A request can say what it is being made for, and a simulated service supplies that when it reaches a
Bucket on a resource's behalf. `sourceArn` and `sourceAccount` go alongside the caller and
reach IAM as the `aws:SourceArn` and `aws:SourceAccount` condition keys:

```typescript
await simS3.getObject(
  new GetObjectCommand({ Bucket: "site", Key: "index.html" }),
  {
    caller: { kind: "service", service: "cloudfront.amazonaws.com" },
    sourceArn: "arn:aws:cloudfront::111111111111:distribution/E1EXAMPLE",
  },
);
```

That is the condition a Bucket policy granting a service principal usually carries, since a service
principal is shared by every resource of that service. A request carrying no such value leaves the
key out entirely, and a statement conditioned on it fails to match. Condition key names are matched
case insensitively, so CDK's `AWS:SourceArn` spelling matches the same key.

Sim CloudFront supplies both when a Distribution's S3 Origin has an origin access control, and that
is [how it serves a private Bucket](https://yulinsim.dev/services/cloudfront/#origin-access-controls).

## Block Public Access

Real S3 turns on all four Block Public Access settings for every new Bucket, and `BlockPublicPolicy`
makes `PutBucketPolicy` reject a policy that allows public access. Sim S3 does the same. A Bucket
starts closed, and a public Bucket policy is refused with `AccessDenied` until the Bucket opts out:

```typescript
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
  }),
);
```

The configuration you supply replaces the previous one wholesale, and a setting you leave out of it
is off. That matches CDK. `BlockPublicAccess.BLOCK_ACLS` names only the two ACL settings, and pairing
it with `publicReadAccess: true` is the usual way to build a public website Bucket.

`GetPublicAccessBlockCommand` reads the settings back, and `DeletePublicAccessBlockCommand` removes
them, which returns the Bucket to fully blocked. In a CloudFormation
template the settings are the `PublicAccessBlockConfiguration` property of `AWS::S3::Bucket`, and a
Stack whose `AWS::S3::BucketPolicy` is public without that opt-out fails to deploy, exactly as the
real deployment would.

The settings govern what may be written rather than what is already stored, so turning
`BlockPublicPolicy` back on afterwards leaves an existing public policy in place.

### What counts as public

A statement is public when it allows a wildcard `Principal` without pinning the caller down. A
`Condition` fixing `aws:SourceAccount`, `aws:SourceArn`, `aws:PrincipalOrgID`, `aws:SourceVpc`,
`aws:SourceVpce`, `aws:SourceOwner`, `aws:userid`, `s3:DataAccessPointArn` or
`s3:DataAccessPointAccount` to a value with no wildcard in it makes the statement non-public, as it
does in real S3. A `Service` principal is never a wildcard, and a `Deny` statement is never public.

### Limitations

Only `BlockPublicPolicy` changes behaviour. The other three settings are stored and reported, and go
no further. `BlockPublicAcls` and `IgnorePublicAcls` govern ACLs, which this simulator leaves out.
`RestrictPublicBuckets` changes how an existing public policy is evaluated for cross-account callers
rather than rejecting a write, and that evaluation is absent so far.

Anything the simulator cannot classify confidently counts as public and is refused, which makes it
stricter than real S3 in places. A `NotPrincipal` statement, a statement with no `Principal`, and a
`Condition` on `aws:SourceIp` all count as public here. Real S3 accepts a sufficiently narrow
`aws:SourceIp` CIDR range as non-public, where the simulator judges no range breadth at all.

Account-level and organisation-level Block Public Access, access points, and `GetBucketPolicyStatus`
are left out.

The static website endpoint authorizes a request that names a principal as that principal, where a
real S3 website endpoint supports only publicly readable content and authenticates nothing. The
simulator is looser here. A website reachable in a test as a named principal can be unreachable in
the same way against real S3.

Bucket ACLs and Object ownership settings are left out, and stay that way by choice. Object Ownership
defaults to Bucket owner enforced on new Buckets, which disables ACLs, and AWS recommends keeping
them disabled in favour of policies.

## Storage classes

Every Object is in a storage class. A write names one and the Object stays there until a lifecycle
rule moves it. `PutObject`, `CopyObject` and `CreateMultipartUpload` all take a `StorageClass`, and
both list operations, `GetObject` and `HeadObject` report where the Object ended up.

```typescript sim-s3-storage-class
/**
 * Writing a simulated S3 Object into an archival storage class.
 */

import {
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "archive",
    Key: "ledgers/2026.csv",
    Body: "a,b",
    StorageClass: "GLACIER",
  }),
);

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "archive" }),
);
const head = await simS3.headObject(
  new HeadObjectCommand({ Bucket: "archive", Key: "ledgers/2026.csv" }),
);

// GLACIER, from the listing and from the Object itself.
console.log(listing.Contents?.[0]?.StorageClass, head.StorageClass);
```

A write naming a class S3 has no such class for is refused with `InvalidStorageClass`, before
anything is stored. The classes taken are `STANDARD`, `REDUCED_REDUNDANCY`, `STANDARD_IA`,
`ONEZONE_IA`, `INTELLIGENT_TIERING`, `GLACIER_IR`, `GLACIER`, `DEEP_ARCHIVE`, `EXPRESS_ONEZONE`,
`OUTPOSTS` and `SNOW`.

A listing always reports a class, and a read reports one only for an Object outside `STANDARD`. That
is how real S3 answers, and it is why `GetObject.StorageClass` is undefined for most Objects. A copy
is stored in the class the copy names rather than the source's, and an upload in parts takes its
class at `CreateMultipartUpload` rather than at the completion.

Where the Object is changes nothing about reading it. Real S3 refuses a read of an archived Object
until `RestoreObject` has brought it back, and sim S3 serves every Object whatever class it is in.
See [Limitations](#limitations).

## Object tags

An Object carries up to ten tags. `PutObjectTaggingCommand`, `GetObjectTaggingCommand` and
`DeleteObjectTaggingCommand` read and replace the whole set, and `PutObject`, `CopyObject` and
`CreateMultipartUpload` take one on the write itself, as the `department=finance&retention=long`
query string real S3 carries it in.

```typescript sim-s3-object-tagging
/**
 * Tagging a simulated S3 Object and reading the tags back.
 */

import {
  CreateBucketCommand,
  GetObjectTaggingCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

// A write can carry its own tags, as the query string S3 takes them in.
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "quarterly.csv",
    Body: "period,total",
    Tagging: "department=finance&retention=long",
  }),
);

// A tagging request replaces the whole set.
await simS3.putObjectTagging(
  new PutObjectTaggingCommand({
    Bucket: "reports",
    Key: "quarterly.csv",
    Tagging: { TagSet: [{ Key: "department", Value: "legal" }] },
  }),
);

const read = await simS3.getObjectTagging(
  new GetObjectTaggingCommand({ Bucket: "reports", Key: "quarterly.csv" }),
);

// [ { Key: "department", Value: "legal" } ]
console.log(read.TagSet);
```

A tag set is put whole, as real S3 puts one. The request above leaves the Object carrying
`department=legal` and nothing else. An Object nobody has tagged reads back with an empty `TagSet`.
Having no tags is a different thing from having no Object, and only the second is `NoSuchKey`.

A set of more than ten tags is refused with `InvalidTag`, and so is one stating a key twice. Both
are checked before anything is written, leaving an Object refused eleven tags carrying none of them.

A copy carries the source Object's tags. `TaggingDirective: REPLACE` puts the request's own
`Tagging` on the copy and drops the source's.

On a Bucket keeping versions, a tag set belongs to the version it was put on. Writing a new version
leaves the one before it carrying what that version was written with, and a tagging request naming a
`VersionId` reaches that version alone.

Tagging an Object raises `s3:ObjectTagging:Put`, and removing its tags raises
`s3:ObjectTagging:Delete`. See [Event notifications](#event-notifications). A lifecycle rule
filtering on a tag selects the Objects carrying it. See [What a rule selects](#what-a-rule-selects).

Each of the three operations is granted by a permission of its own, `s3:GetObjectTagging`,
`s3:PutObjectTagging` and `s3:DeleteObjectTagging`. `s3:PutObject` grants none of them. All three are
served over the S3 REST endpoint under the `?tagging` sub-resource, so the CLI reaches the same
handlers an SDK caller does.

### Limitations

- Bucket tags are inert. `Tags` on an `AWS::S3::Bucket` is recorded and never read.
- The `s3:ExistingObjectTag` and `s3:RequestObjectTag` IAM condition keys are left out. A Bucket
  policy written against either matches no request.
- `GetObjectAttributes` is left out, and neither `GetObject` nor `HeadObject` reports
  `x-amz-tagging-count`.
- Tag keys and values are stored as they arrive. Real S3 bounds a key at 128 characters and a value
  at 256, and sim S3 accepts a longer one of either.
- A Bucket mounted on a filesystem directory rebuilds each Object from the file on every read, and a
  directory holds no tags. Tagging one writes the same bytes back to the file, and the next read
  reports an untagged Object. Use the default in-memory storage to test tagging. See
  [Metadata a file cannot carry](#metadata-a-file-cannot-carry).

## Default encryption

Every Bucket is encrypted, and every Object written into one reports the algorithm it was stored
under. Nothing is actually encrypted here. The bytes are stored as they arrive and the ETag stays
the MD5 of them, which is what real S3 reports for an SSE-S3 Object too. What this gives a test is
the answer S3 gives about an Object, so code that reads `ServerSideEncryption` or the
`x-amz-server-side-encryption` header has something to read.

```typescript sim-s3-bucket-encryption
/**
 * Configuring a simulated S3 Bucket's default encryption.
 */

import {
  CreateBucketCommand,
  GetBucketEncryptionCommand,
  GetObjectCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "documents" }));

await simS3.putBucketEncryption(
  new PutBucketEncryptionCommand({
    Bucket: "documents",
    ServerSideEncryptionConfiguration: {
      Rules: [
        { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "documents",
    Key: "contracts/one.pdf",
    Body: "one",
  }),
);

const configured = await simS3.getBucketEncryption(
  new GetBucketEncryptionCommand({ Bucket: "documents" }),
);
const read = await simS3.getObject(
  new GetObjectCommand({ Bucket: "documents", Key: "contracts/one.pdf" }),
);

// aws:kms, from the Bucket's configuration and from the Object it stamped.
console.log(
  configured.ServerSideEncryptionConfiguration?.Rules?.[0]
    ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
  read.ServerSideEncryption,
);
```

A write names its own algorithm, the Bucket's configuration answers for a write that names none, and
a Bucket nobody has configured is `AES256`. Real S3 has encrypted every new Object that way since
January 2023, and `GetBucketEncryption` answers for an unconfigured Bucket with the same `AES256`
rule rather than an error. `DeleteBucketEncryption` puts a Bucket back to that rule, since there is
no such thing as an unencrypted Bucket.

`AES256`, `aws:kms` and `aws:kms:dsse` are taken, and anything else is refused with
`InvalidArgument`. The Objects already in a Bucket keep what they were written with when its
configuration changes.

An Object that reached a Bucket without a write reports no encryption at all. That covers the files
a mounted directory serves and the ones a CDK `BucketDeployment` publishes, since neither went
through `PutObject` to be stamped by one.

An `AWS::S3::Bucket` `BucketEncryption` property is applied as the request is. CloudFormation states
the rule under `ServerSideEncryptionByDefault` where the request states
`ApplyServerSideEncryptionByDefault`, and the Resource translates that one name.

## Lifecycle configuration

Sim S3 stores a Bucket's lifecycle rules and acts on them. An `Expiration` rule removes the Objects
it selects once simulated time passes the boundary, a `Transitions` rule moves them between storage
classes, a `NoncurrentVersionExpiration` rule bounds the history a versioned Bucket keeps, and an
`AbortIncompleteMultipartUpload` rule discards uploads that were started and left unfinished.

Retention is otherwise the one property of a log or a backup Bucket a test cannot demonstrate.
Reading the rules back off a deployed Bucket says the rules arrived. Putting an Object, moving the
clock and finding the Object gone says the Bucket keeps what it was configured to keep.

```typescript sim-s3-lifecycle-expiry
/**
 * Expiring simulated S3 Objects against a lifecycle rule.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "logs",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "expire-raw-logs",
          Status: "Enabled",
          Filter: { Prefix: "raw/" },
          Expiration: { Days: 365 },
        },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "logs",
    Key: "raw/2026-08-24.gz",
    Body: "one raw log line",
  }),
);

await simAws.clock().advanceBy({ days: 366 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "logs", Prefix: "raw/" }),
);

// The rule expired the Object, so the listing is empty.
console.log(listing.Contents ?? []);
```

An Object goes the moment the clock reaches the boundary. Real S3 removes an expired Object some
time after it and bills up to the removal, which a test would have to wait out. Expiring on the
boundary is the answer a test can assert against.

Expiry happens when the Bucket is read. What `ListObjectsV2`, `GetObject` and `HeadObject` find is
what the rules leave at that instant, and a Bucket carrying no rules costs one comparison. Moving
the clock backwards afterwards leaves an expired Object gone, because the rule deleted it on the way
past.

### Bounding the history a versioned Bucket keeps

A versioned Bucket gains a version on every write and keeps every one of them. A
`NoncurrentVersionExpiration` rule bounds that. `NoncurrentDays` removes a version once simulated
time passes it, counted from the moment that version stopped being current rather than from its
write, which is how real S3 measures it. A version written a year ago and displaced yesterday has
been noncurrent for a day.

```typescript sim-s3-noncurrent-expiry
/**
 * Bounding a reader's history at ninety days of noncurrent versions.
 */

import {
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reader-history" },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simS3.putBucketVersioning(
  new PutBucketVersioningCommand({
    Bucket: "reader-history",
    VersioningConfiguration: { Status: "Enabled" },
  }),
);

await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "reader-history",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "bound-history",
          Status: "Enabled",
          Filter: { Prefix: "snapshots/" },
          NoncurrentVersionExpiration: { NoncurrentDays: 90 },
        },
      ],
    },
  }),
);

const snapshot = {
  Bucket: "reader-history",
  Key: "snapshots/reader-1.json",
};

await simS3.putObject(new PutObjectCommand({ ...snapshot, Body: "before" }));
await simS3.putObject(new PutObjectCommand({ ...snapshot, Body: "after" }));

await simAws.clock().advanceBy({ days: 91 });

const listed = await simS3.listObjectVersions(
  new ListObjectVersionsCommand({ Bucket: "reader-history" }),
);

// The version the second write displaced has gone, and the current one stays
// however old it is.
console.log(listed.Versions?.length); // 1
```

`NewerNoncurrentVersions` holds that many of the most recent noncurrent versions back from the rule,
whatever their age, so a rule keeping two reaches the third and everything older. Real S3 requires
`NoncurrentDays` alongside it, and a rule stating the count on its own names no period to measure and
expires nothing.

`ExpiredObjectDeleteMarker` under `Expiration` removes a delete marker left with no version under it,
which takes the key out of `ListObjectVersions` altogether. A marker still hiding a version stays,
since that marker is what a read of the key answers with. The two run in that order in one pass, so a
marker whose last version expired in the same pass goes with it.

A noncurrent version is removed from the Bucket's history, and a `GetObject` naming its `VersionId`
answers `NoSuchVersion` afterwards. The current version is beyond every rule of this kind, however
old it is.

### Transitioning between storage classes

A `Transitions` rule moves the Objects it selects into another storage class as the clock passes the
days it names. A rule listing several walks an Object down them, and the last transition reached is
where the Object is. `NoncurrentVersionTransitions` does the same for the versions a write has
displaced, counted from the moment each stopped being current.

```typescript sim-s3-lifecycle-transition
/**
 * Moving simulated S3 Objects between storage classes on a lifecycle rule.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "logs",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "cool-then-freeze",
          Status: "Enabled",
          Filter: { Prefix: "raw/" },
          Transitions: [
            { Days: 30, StorageClass: "STANDARD_IA" },
            { Days: 90, StorageClass: "GLACIER" },
          ],
        },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "logs",
    Key: "raw/2026-08-24.gz",
    Body: "one raw log line",
  }),
);

await simAws.clock().advanceBy({ days: 90 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "logs", Prefix: "raw/" }),
);

// GLACIER, the last transition the clock reached.
console.log(listing.Contents?.[0]?.StorageClass);
```

A transition is worked out when the Bucket is read, as an expiry is, so what a listing or a read
reports is where the rules put the Object at that instant. The bytes stay where they are. Moving the
clock back afterwards moves the Object back, and an expiry that has already happened stays done. The
expiry deleted something on the way past, and a transition changed only what S3 says about the
Object.

A rule naming a class S3 has no such class for is refused with `InvalidStorageClass` where the
configuration is stored, before it reaches any Object. An `Expiration` on the same rule still expires
at its own age, whatever the transitions have done in the meantime.

### What a rule selects

A rule selects Objects by its `Filter`, or by the older top-level `Prefix`. A rule with no scope at
all covers every key in the Bucket. `Filter.Prefix`, `Filter.And.Prefix`, `ObjectSizeGreaterThan` and
`ObjectSizeLessThan` are all read. A `Disabled` rule is stored and skipped.

A multipart upload is selected by its key alone. Half an upload has no size. A rule narrowed by an
object size bound abandons no upload.

A rule narrowed by `Filter.Tag`, or by the `Filter.And.Tags` beside a prefix, selects the Objects
carrying every tag it names. Both halves of a tag have to match, so a rule for `archive=true` leaves
an Object tagged `archive=false` where it is. A template states the same thing as `TagFilters` beside
the rule's `Prefix`, and it is read into the `Filter` the request takes. See
[Object tags](#object-tags).

```typescript sim-s3-lifecycle-tag-filter
/**
 * Expiring the simulated S3 Objects a tag selects.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "reports",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "expire-temporary",
          Status: "Enabled",
          Filter: { Tag: { Key: "lifecycle", Value: "temporary" } },
          Expiration: { Days: 7 },
        },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "draft.csv",
    Body: "period,total",
    Tagging: "lifecycle=temporary",
  }),
);
await simS3.putObject(
  new PutObjectCommand({ Bucket: "reports", Key: "final.csv", Body: "a,b" }),
);

await simAws.clock().advanceBy({ days: 8 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "reports" }),
);

// Only final.csv. The tagged draft is past its expiry.
console.log(listing.Contents?.map((entry) => entry.Key));
```

A tagging request that takes an Object out of a rule's reach takes it out for good. The rule reads
the tags the Object carries at the moment the Bucket is read.

An Object a rule reaches by tag alone is reached wherever it is in the Bucket. A bare `Filter.Tag`
says nothing about the key.

### Reading and replacing the rules

```typescript sim-s3-lifecycle-configuration
import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simAws.cloudFormation().deployTemplate({
  stackName: "logs-stack",
  template: {
    Resources: {
      LogBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "logs",
          LifecycleConfiguration: {
            Rules: [
              {
                Id: "expire-raw-logs",
                Status: "Enabled",
                Prefix: "raw/",
                ExpirationInDays: 365,
              },
            ],
          },
        },
      },
    },
  },
});

// The template's rule reads back off the deployed Bucket, in the shape the SDK
// states one in.
const deployed = await simS3.getBucketLifecycleConfiguration(
  new GetBucketLifecycleConfigurationCommand({ Bucket: "logs" }),
);

console.log(deployed.Rules);

// A put replaces the whole configuration, so a rule it leaves out is gone.
await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "logs",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "abort-incomplete-uploads",
          Status: "Enabled",
          Filter: { Prefix: "" },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
        },
      ],
    },
  }),
);
```

`DeleteBucketLifecycleCommand` removes the configuration, and is idempotent as in real S3. A Bucket
carrying no rules answers `GetBucketLifecycleConfigurationCommand` with
`NoSuchLifecycleConfiguration` rather than an empty list, which is how real S3 separates a Bucket
nobody configured from one configured to do nothing.

A configuration stating no rules at all is refused with `MalformedXML`. So is a rule whose `Status`
is anything but `Enabled` or `Disabled`, and a rule stating no action to take, meaning none of
`Expiration`, `Transitions`, `NoncurrentVersionExpiration`, `NoncurrentVersionTransitions` or
`AbortIncompleteMultipartUpload`. An empty list of transitions counts as no action. Real S3 refuses
all three, and a rule stored here that real S3 would have rejected reads back looking configured.

### From a CloudFormation template

CloudFormation spells some rule fields differently from the request. `Id` becomes `ID`,
`ExpirationInDays` and `ExpirationDate` are gathered under `Expiration`, and a transition's
`TransitionInDays` becomes `Days`. The singular `Transition` a template may state alongside
`Transitions` joins the list. `NoncurrentVersionExpirationInDays` becomes the `NoncurrentDays` of a
`NoncurrentVersionExpiration`, which is what CDK's `noncurrentVersionExpiration` synthesises, and a
template stating the nested object instead is taken as it stands. `TagFilters` becomes the `Filter`
the request holds a rule's tags in, taking the rule's `Prefix` in with it where it states one.
Everything else, `Status`, `AbortIncompleteMultipartUpload` and the object size bounds among them, is
carried across as the template stated it.

`LifecycleConfiguration` is one of the properties simulated S3 acts on. It stays out of
[`stack.ignoredProperties`](https://yulinsim.dev/services/cloudformation/#properties-a-resource-was-created-without).
The actions it enforces are `Expiration`, whether the template flattened it onto the rule or not,
`Transitions` and `NoncurrentVersionTransitions`, `NoncurrentVersionExpiration`, in either of its
two spellings, and `AbortIncompleteMultipartUpload`. Which Objects an enforced action reaches is
decided by the fields listed under [What a rule selects](#what-a-rule-selects).

### Limitations

Real S3 raises `s3:LifecycleExpiration:Delete` when a rule removes an Object, and
`s3:LifecycleTransition` when one moves an Object. Both event families are among the ones sim S3
leaves out. An expiry and a transition here are silent.

A transition changes the class an Object reads back in and nothing else. Real S3 also takes an
Object in an archival class out of reach until `RestoreObject` has brought it back, and sim S3
serves every Object whatever class a rule has moved it to.

An `Expiration` rule on a versioned Bucket writes a delete marker over the current version and
leaves the version itself where it is, which is what real S3 does, and a
`NoncurrentVersionExpiration` rule is what then removes it. See
[Object versioning](#object-versioning).

A Bucket mounted on a filesystem directory refuses the deletion an expiry asks for, the way it
refuses `DeleteObject`, and answers `NotImplemented`. Removing a real file off the mounted directory
is worse than reporting that the rule cannot run. Use the default in-memory storage to test
retention.

`GetBucketLifecycleConfiguration` and its siblings are reachable through the SDK and not over the
served S3 REST endpoint.

## Static website hosting

Configure Bucket website hosting with `PutBucketWebsiteCommand`.

Website hosting settles which Object answers a request. Who may read it is a separate question. A
browser asking for a page is anonymous, and anonymous holds nothing unless a Bucket policy grants
it. A site with no Bucket policy answers `403` to every ordinary visitor, as it does on real S3. See
[Block Public Access](#block-public-access) for the two commands a public site needs. The localhost
serving example below shows them in place. The examples in this section configure hosting without
serving it, and leave that out.

A request that does name a principal, through a signature or the `x-sim-aws-caller` header, is
authorized as that principal, and an identity policy granting `s3:GetObject` reaches the website
endpoint too. Real S3 has no such thing. Its website endpoint supports only publicly readable
content and never authenticates a request. This is a deliberate simulator affordance, in keeping
with the other simulated services that serve HTTP, and it means a website test driven as a named
principal proves less than one driven as a browser would be.

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

Static website hosting must be enabled before the sim Bucket can be served over HTTP. The localhost
server returns `403` until it is.

## Serve simulated S3 on localhost

Use `serveSimAws` when you want application code to make real HTTP requests to the simulated S3, or
to access the simulated services via your browser or commandline with curl.

```typescript sim-s3-serve-localhost
/**
 * Serving simulated S3 on localhost.
 */

import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
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

  // A website endpoint serves only what the Bucket policy makes readable, and
  // a public policy needs the Block Public Access opt-out first.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "foo-site",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "foo-site",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::foo-site/*",
        },
      }),
    }),
  );

  const websiteUrl = simS3.getBucketWebsiteUrl("foo-site");
  const localWebsiteUrl = srv.localUrl(websiteUrl);

  const response = await fetch(localWebsiteUrl);

  console.log(response.status);
  console.log(response.headers.get("content-type"));
  console.log(await response.text());
} finally {
  await srv.close();
}
```

The `getBucketWebsiteUrl(...)` method returns the simulated S3 website URL for the Bucket. The
`localUrl(...)` method on the localhost server adapts that URL so the request is sent to the local
server while preserving the simulated S3 website hostname.

## Presigned URLs

Sim S3 serves a REST API endpoint alongside the website endpoint, and it accepts presigned URLs
built by the real AWS presigner, `getSignedUrl` from `@aws-sdk/s3-request-presigner`. Nothing about
the signing is simulated. An `S3Client` is pointed at the simulated endpoint and signs as it would
against real S3, and sim IAM verifies the signature it produced.

Presigning is entirely client-side, and this works whether or not the URL is ever fetched over a
real socket. Install the presigner alongside the SDK:

```bash
npm install --save-dev @aws-sdk/s3-request-presigner
```

`simS3.getServiceUrl()` gives the endpoint to configure the client with. Sim S3 also has
`getBucketUrl(...)` for the virtual-hosted endpoint of one Bucket, though a client adds the Bucket
to the service endpoint for itself.

A client pointed at an endpoint URL presigns too, the `http://localhost:<port>` form that
`--endpoint-url` and `AWS_ENDPOINT_URL` take. Such a URL names no service in its hostname and is
routed by the credential scope it carries, so sign it with `forcePathStyle` and the Bucket goes in
the path. See [S3 over the endpoint](https://yulinsim.dev/serve/#s3-over-the-endpoint).

```typescript sim-s3-presigned-url
/**
 * Downloading a simulated S3 Object through a presigned URL.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.region("eu-west-2").s3();
  const simIam = simAws.iam();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "reports",
      Key: "q3/report.txt",
      Body: "quarterly numbers",
      ContentType: "text/plain",
    }),
  );

  // Whoever presigns the URL needs permission for what it will be used for.
  await simIam.createUser(new CreateUserCommand({ UserName: "Publisher" }));
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Publisher",
      PolicyName: "ReadReports",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::reports/*",
        },
      }),
    }),
  );
  const accessKey = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Publisher" }),
  );

  // The endpoint includes the port the local server took, because a presigned
  // URL signs its own host and cannot be redirected elsewhere afterwards.
  const s3Client = new S3Client({
    region: "eu-west-2",
    endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
    credentials: {
      accessKeyId: accessKey.AccessKey.AccessKeyId,
      secretAccessKey: accessKey.AccessKey.SecretAccessKey,
    },
  });

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: "reports", Key: "q3/report.txt" }),
    { expiresIn: 900 },
  );

  const response = await fetch(url);

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

A presigned URL grants exactly what the principal who signed it holds. Sim IAM resolves that
principal from the signature and authorizes `s3:GetObject` as them. A user without permission cannot
presign around it. Temporary credentials from an STS `AssumeRoleCommand` work the same way,
carrying their session token in the URL.

A request to the REST endpoint presenting no signature and naming no principal in the
`x-sim-aws-caller` header is anonymous, and anonymous holds nothing unless a Bucket policy says
otherwise. That header is always enabled and wins over a signature, and a request driven by hand can
be any principal without signing anything, exactly as it can against the other simulated services
that serve HTTP. See
[the sim IAM docs](https://yulinsim.dev/services/iam/#what-the-simulator-reports-back) for the whole boundary.

### Expiry in simulated time

`X-Amz-Expires` is judged against Yulin's simulated clock. A frozen clock keeps a URL usable however
long a test spends, and advancing past the window expires it with the `AccessDenied` and
`Request has expired` real S3 answers with:

```typescript
simAws.clock().freeze();
const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

await simAws.clock().advanceBy({ minutes: 20 });
const response = await fetch(url); // 403
```

### Uploads and checksums

Presigned `PutObjectCommand` URLs work in the same way, with one thing to watch. The AWS SDK computes
a checksum when it presigns, before there is a body to hash, and hoists it into the signed
URL. Uploading anything else through that URL then fails against real S3, and fails here too, with
`XAmzContentChecksumMismatch`. Build the client with
`requestChecksumCalculation: "WHEN_REQUIRED"` to presign upload URLs that accept a body:

```typescript
const s3Client = new S3Client({
  region: "eu-west-2",
  endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials,
});
```

### What an upload says about the Object

An upload keeps the metadata headers it was sent. `cache-control`, `content-disposition`,
`content-encoding`, `content-language`, `content-type` and `expires` are stored, and a read is
served every one of them, the way it serves an Object written by a `PutObjectCommand`. See
[Object system metadata](#object-system-metadata). An `x-amz-meta-` header is stored too, and an
in-process read reports it in `Metadata`. An `x-amz-tagging` header puts the tags it names on the
Object, the same way a `PutObjectCommand` does. See [Object tags](#object-tags).

```typescript
await fetch(url, {
  method: "PUT",
  body: styleSheet,
  headers: {
    "content-type": "text/css",
    "cache-control": "public, max-age=31536000, immutable",
  },
});
```

### Headers the URL asks for

A read can name the headers it wants the Object served with. The SDK sets them from
`ResponseContentType`, `ResponseContentDisposition`, `ResponseCacheControl`,
`ResponseContentEncoding`, `ResponseContentLanguage` and `ResponseExpires`, and carries them in the
`response-` query parameters real S3 reads. Simulated S3 serves those values in place of the
Object's own.

```typescript
const url = await getSignedUrl(
  s3Client,
  new GetObjectCommand({
    Bucket: "reports",
    Key: "q3/report.pdf",
    ResponseContentType: "application/octet-stream",
    ResponseContentDisposition: 'attachment; filename="q3-report.pdf"',
  }),
  { expiresIn: 900 },
);
```

The Object keeps the metadata it was written with. One URL can hand a browser a download while
another shows the same Object in the page. A `HEAD` reads the parameters as a `GET` does, and the
API endpoint honours them for any read rather than only a presigned one. The website endpoint serves
none of them, as real S3 serves none there.

### Limitations

- `GET`, `HEAD`, `PUT` and `DELETE` of an Object are served over a Bucket's own REST endpoint, which
  is what a presigned URL addresses. Bucket operations and multipart uploads there are refused with
  `501`. `DeleteObjects` is a `POST` to the Bucket, so it is available through the SDK and
  unavailable over a presigned URL. The shared endpoint `serveSimAws` binds serves all of them. See
  [Serve simulated S3 on localhost](#serve-simulated-s3-on-localhost).
- `createPresignedPost` and SigV4A presigning are left out.
- Checksums are verified for CRC32, SHA1 and SHA256. An upload stating a CRC32C or CRC64NVME checksum
  is refused, and never stored unchecked.
- Responses carry the Object's `ETag` and `Last-Modified`, and no conditional request is honoured.
  `If-None-Match` and `If-Modified-Since` are ignored, and the Object is served in full.

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

The first matching routing rule is used. A rule can match by `KeyPrefixEquals`, by
`HttpErrorCodeReturnedEquals`, by both, or by no condition at all. Redirects support configured host, protocol,
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

### Reloading the browser when the directory changes

The Bucket is reading the files, and a rebuild copies nothing into it. All that is left is telling
the browser. Give the mount somewhere to reload and it watches the directory for you:

```typescript sim-s3-mount-reload
/**
 * Reloading the browser when a build writes into a mounted directory.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  reload: srv,
});
```

A build writing a whole tree of files is one reload, and never one per file. The writes are held
until they stop arriving. `settleMs` is how long that wait is, in milliseconds, for a generator that
pauses part way through a build:

```typescript sim-s3-mount-reload-settle
/**
 * Waiting longer for a slow build to finish writing.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "dist"), {
  reload: srv,
  settleMs: 500,
});
```

Anything with a `reload()` method will do, and a test can watch a mount without serving anything.

The watch is recursive, and holds an open filesystem handle that keeps the process alive. A dev
process wants exactly that. Anything with an end, such as a test, calls
`simAws.s3().stopWatchingMountedDirectories()` when it is done.
`simAws.s3().watchedMountedDirectories()` says which directories are being watched.
[`simAws.close()`](https://yulinsim.dev/serve/#stopping-and-restarting) is the one that names no service
and no scope. It lets go of the mounted directory watches along with everything else the environment
is holding, and a served environment gets that from `srv.close()`.

Under [`yulin watch`](https://yulinsim.dev/serve/#restarting-on-a-file-change), a mount that reloads for
itself is left alone by the supervisor. A rebuild reloads the page rather than restarting the
process and taking every simulated Bucket, Table and Stack with it. A mount without a reload target
is still reported to the supervisor as a directory to watch, and a change in it restarts the
process.

Filesystem storage is somewhat restrictive to make it slightly safer:

- The directory path must be absolute
- The directory must not be the filesystem root
- The directory must not be the user's home directory
- The path must not contain `..`
- Object keys must not be absolute paths or contain `..`
- Only files whose extension is on a cautious list are served (see below)
- Symlinks are ignored when listing Objects
- Deletion is refused until the mount asks for it (see below)

When reading files from filesystem-backed storage, Yulin infers common `content-type` metadata from
file extensions such as `.html`, `.css`, `.js`, `.json`, `.png`, `.svg`, `.txt`, `.csv`, `.pdf`,
`.xml`, and common font and image formats. A served file whose extension falls outside that set gets
`binary/octet-stream`, as S3 reports for an Object whose type it was never told. That only comes up
for an extension a mount named itself, below. No other file is served at all, with or without a
type.

### Deleting the files under a mount

`DeleteObject` against a filesystem-backed Bucket raises `NotImplemented`, and `DeleteObjects`
reports the same code for every key. This is stricter than real S3, deliberately. The directory a
Bucket is mounted on is an ordinary directory of yours, and removing files from it because a test
called `DeleteObject` would be a poor default.

Code that deletes what it uploaded needs a Bucket that can. A mount says so with `allowDelete`, and
a delete then unlinks the file, reports the removal and raises the `ObjectRemoved:Delete` event an
in-memory Bucket raises:

```typescript sim-s3-mount-allow-delete
/**
 * Letting a mounted Bucket delete the files it serves.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

simAws
  .s3()
  .mountBucketFilesystem("uploads", path.join(process.cwd(), "assets"), {
    allowDelete: true,
  });
```

The key goes through the checks above either way. A delete naming a path that climbs out of the
directory is refused, and so is one naming a file type the mount does not serve. The directory the
file was in stays where it is, since a Bucket has no directories for an empty one to be. Leave the
option off and the refusal stands, naming the directory it would have unlinked from.

### Serving a file extension of your own

A mounted Bucket only serves files whose extension is on a cautious list (the web's own types, and
nothing else) so that pointing a Bucket at a directory cannot be talked into reading whatever else
happens to be in it. A file with any other extension goes unserved, and a `GetObject` for it comes
back as though the file were absent. That is the right default and the wrong answer for a site with
a data file of its own. A mount can name the extensions it needs:

```typescript sim-s3-mount-file-extensions
/**
 * Serving a data file whose extension is not one of the web's own.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  // A pinyin dictionary ships a binary frequency table beside its text files.
  additionalFileExtensions: [".freq"],
});
```

These are added to the list rather than replacing it, so naming one cannot cost you `.html`, and a
leading dot is optional. Everything not named is still refused.

### Metadata a file cannot carry

A stored Object holds what S3 was told when it was written. A file holds its bytes and its name, so
a mounted Bucket has only the extension to go on, and reports a `content-type` and no more.
Anything a deployment would have set is either inherited from the deployment, below, or declared on
the mount, for the Objects under a key prefix.

`ContentEncoding` is the one a site can be broken without. A directory of brotli files served with
no `content-encoding` is bytes no browser can decode:

```typescript sim-s3-mount-system-metadata
/**
 * Declaring the encoding of a compressed mirror in a mounted directory.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  // The mirrored copies keep their own names, so `br/js/app.js` is still typed
  // `text/javascript` from its extension. Nothing about the file says it is
  // compressed, which is what this declares.
  systemMetadata: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
});
```

The fields are the ones a [`PutObjectCommand`](#object-system-metadata) sets, and every value is a
string, including `Expires`. Every declaration whose prefix the key starts with applies, in the
order they were given, and a later one wins where two name the same header. An empty prefix is every
Object in the Bucket. A declared `ContentType` replaces the one guessed from the extension.

### Inheriting what the deployment set

A mount rarely has to declare any of that, because something in the same simulated account has
already said it. A CDK [`BucketDeployment`](https://yulinsim.dev/services/cloudformation/#cdk-s3-bucketdeployment)
sets these headers through its own `SystemMetadata`, and says so on the destination Bucket as well as
setting them on the Objects it copies. Mounting a directory over that Bucket replaces the Objects and
inherits what the Bucket was told about them. The files on disk are then served as the deployed ones
were:

```typescript sim-s3-mount-deployed-system-metadata
/**
 * Serving a rebuilt directory as the deployment that filled the Bucket did.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The Stack publishes the site. Its BucketDeployments say what they set, such
// as `content-encoding: br` for the compressed mirror under `br/`.
await simAws
  .cloudFormation()
  .deployTemplateFile("cdk.out/SiteStack.template.json");

// The Bucket then serves the generator's output as it is rebuilt. Nothing about
// those files says how they were compressed, and nothing here has to either.
simAws
  .s3()
  .mountBucketFilesystem("site-bucket", path.join(process.cwd(), "public"));
```

The order is free. A directory can be mounted into a Bucket before the Stack describing it is
deployed, and the mount answers with whatever the Bucket has been told by the time an Object is read.

What a deployment published is what it is sure of, and a file it copied is described exactly. A file
a later build wrote is described by the rule the deployment would have published it under (its
destination key prefix and its filters) as long as only one deployment claims it. Where two
deployments into one Bucket could both have published a file that neither did, nothing is inherited
for it. Serving a page as another deployment's brotli breaks it, where serving the file as it is on
disk leaves it readable. Declare those on the mount.

Anything declared on the mount goes over the top of all of it, one header at a time. That is how a
mount answers differently on purpose. A deployed site caching its assets for a year is the usual
reason:

```typescript sim-s3-mount-override-system-metadata
/**
 * Keeping a deployment's encoding while dropping its caching locally.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .cloudFormation()
  .deployTemplateFile("cdk.out/SiteStack.template.json");

simAws
  .s3()
  .mountBucketFilesystem("site-bucket", path.join(process.cwd(), "public"), {
    // `content-encoding` is still the deployment's, because this says nothing
    // about it. A year of caching is not what a rebuild wants reaching the
    // browser, so that one is answered here instead.
    systemMetadata: [{ keyPrefix: "", metadata: { CacheControl: "no-store" } }],
  });
```

Pages served with [live reload](https://yulinsim.dev/serve/) are already sent `no-store`, and an HTML
document is never what a stale cache is holding on to. Assets a build rewrites in place are, and a
declaration like this one is what they need.

## Object system metadata

S3 keeps a handful of headers about an Object when it is written and hands them back on every read.
Sim S3 stores and returns `cache-control`, `content-disposition`, `content-encoding`,
`content-language`, `content-type` and `expires`, alongside a `content-length` describing the body
being served.

`GetObjectCommand` and `HeadObjectCommand` answer with these in fields of their own (`ContentType`,
`CacheControl` and the rest), the way real S3 does. `Metadata` carries the user-defined metadata a
write attached, and nothing else.

Every path that serves an Object goes through the same mapping. The REST endpoint, the
[website endpoint](#static-website-hosting) and a CloudFront S3 Origin all report the same headers
for it. `content-encoding` is the one that matters most. Bytes served without it are bytes no client
can decode, and an Object stored as brotli is only usable if the header comes back with it.

`PutObjectCommand` sets them, one request field per header. An upload over a
[served endpoint](#presigned-urls) sets them in the headers themselves, which is the form the SDK
sends them in.

```typescript sim-s3-object-system-metadata
/**
 * Writing an Object with the system metadata S3 returns on a read.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simS3 = new SimAws().s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "app.js",
    Body: "compressed bytes",
    CacheControl: "public, max-age=31536000, immutable",
    ContentDisposition: 'inline; filename="app.js"',
    ContentEncoding: "br",
    ContentLanguage: "en-GB",
    ContentType: "text/javascript",
    Expires: new Date("2027-01-02T03:04:05Z"),
  }),
);

const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "site", Key: "app.js" }),
);

// Each header comes back in the field a read describes an Object with.
console.log(objectOut.ContentEncoding); // br
console.log(objectOut.ExpiresString); // Sat, 02 Jan 2027 03:04:05 GMT
```

A header the write says nothing about is left unset, and never stored empty, so a read leaves it
out. Content type is the exception. S3 gives an Object one whether the write named it or not, and a
read of an Object written without one reports `binary/octet-stream`.

`Expires` is the one field that takes something other than a string. The SDK takes a `Date` on the
way in. A read hands back the stored HTTP date as `ExpiresString`, alongside the same value parsed
into a `Date` as `Expires`.

A read can ask for headers of its own in place of these. See
[Headers the URL asks for](#headers-the-url-asks-for). The Object goes on holding what it was
written with.

A CDK BucketDeployment's `SystemMetadata` sets the same headers on every Object it copies. See
[CDK S3 BucketDeployment](https://yulinsim.dev/services/cloudformation/#cdk-s3-bucketdeployment). A
[mounted directory](#metadata-a-file-cannot-carry) declares them for the Objects under a key prefix,
since a file on disk carries none of them.

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

A standalone `SimS3` instance has its own isolated state, with no wider `SimAws` environment behind
it.

## Available functionality

Sim S3 currently supports:

- `CreateBucketCommand` and `ListBucketsCommand`
- `HeadObjectCommand` and `HeadBucketCommand`, describing an Object or a Bucket without reading it
- `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command` and `ListObjectsCommand`, with an
  ETag and a last-modified time on every Object
- `Delimiter` on a listing, rolling keys up into `CommonPrefixes` so a Bucket can be walked as a
  folder tree, over the SDK and over a served endpoint
- `CreateMultipartUploadCommand`, `UploadPartCommand`, `CompleteMultipartUploadCommand`,
  `AbortMultipartUploadCommand`, `ListMultipartUploadsCommand` and `ListPartsCommand`, so `aws s3 cp`
  and `@aws-sdk/lib-storage` can upload a file of real size
- `Range` on `GetObjectCommand`, answering with the bytes asked for and `206 Partial Content` over a
  served endpoint, so `aws s3 cp` downloads a file of real size unchanged
- `CopyObjectCommand`, authorized as a read of the source and a write of the destination, with a
  `MetadataDirective` deciding which metadata the copy carries, over the SDK and over a served
  endpoint, letting `aws s3 cp` and `aws s3 mv` move an Object between two served Buckets
- `DeleteObjectCommand` and `DeleteObjectsCommand`, authorized per Object by sim IAM
- `PutBucketNotificationConfigurationCommand` and `GetBucketNotificationConfigurationCommand`, with
  Object events delivered to a simulated Lambda function, a simulated SQS queue or a simulated SNS
  topic
- `PutBucketVersioningCommand`, `GetBucketVersioningCommand` and `ListObjectVersionsCommand`, with
  every write of a key kept, a delete writing a marker over it, and a named version readable and
  removable on its own
- `PutBucketWebsiteCommand`, for static website hosting
- `PutBucketLifecycleConfigurationCommand`, `GetBucketLifecycleConfigurationCommand` and
  `DeleteBucketLifecycleCommand`, storing a Bucket's lifecycle rules and expiring, transitioning and
  abandoning against them in simulated time
- `PutBucketPolicyCommand`, `GetBucketPolicyCommand` and `DeleteBucketPolicyCommand`, evaluated by
  sim IAM alongside identity policies
- The `AWS::S3::Bucket` and `AWS::S3::BucketPolicy` CloudFormation resources
- Block Public Access, on by default as in real S3, refusing a public Bucket policy unless the Bucket
  opts out with `PutPublicAccessBlockCommand` or `PublicAccessBlockConfiguration`
- Serving static website requests on localhost with `serveSimAws`
- Serving Object `GET`, `HEAD`, `PUT` and `DELETE` over the S3 REST endpoint, authorized by sim IAM,
  and the `?uploads` and `?uploadId` sub-resources a multipart upload is made of
- Presigned URLs built by the real `@aws-sdk/s3-request-presigner`, with expiry in simulated time
- Object system metadata set by a `PutObjectCommand`, or by the headers of an upload over a served
  endpoint, and returned on a read, over every endpoint that serves an Object
- `response-` parameters on a read, serving the headers the request named in place of the Object's
  own, which is what a presigned URL offering a download uses
- `EncodingType` on a listing, encoding the keys, prefixes and markers it answers with
- Object storage classes, named on a write and moved by a lifecycle rule, reported on a listing and
  on a read
- Object tags, taken on a write and on a copy, read and replaced by `PutObjectTaggingCommand`,
  `GetObjectTaggingCommand` and `DeleteObjectTaggingCommand`, filtered on by a lifecycle rule, and
  raising `s3:ObjectTagging:Put` and `s3:ObjectTagging:Delete`
- `PutBucketEncryptionCommand`, `GetBucketEncryptionCommand` and `DeleteBucketEncryptionCommand`,
  and the `BucketEncryption` property of an `AWS::S3::Bucket`, deciding the algorithm an Object
  reports
- Bucket website index documents, error documents, trailing-slash redirects, redirect-all
  configuration, and routing-rule redirects
- Bucket-global uniqueness within a `SimAws` instance across simulated Accounts and Regions
- In-memory Object storage by default
- Optional filesystem-backed Bucket storage with `mountBucketFilesystem(...)`, watching the mounted
  directory and reloading connected browsers when it is rebuilt, reporting the system metadata a
  CDK `BucketDeployment` into the same Bucket published, alongside anything the mount declares for a
  key prefix itself, and deleting the files under it where the mount allows that

The simulator aims at useful behaviour for tests and local development, short of full S3 feature
parity. Unsupported S3 options may be ignored or may throw errors depending on whether the simulator
needs them to model the requested behaviour.

## Limitations

These apply across the page. The sections above each list what is specific to them.

- A storage class says where S3 keeps an Object and nothing else. Every Object is readable whatever
  class it is in, `RestoreObject` is left out, and nothing costs or takes longer in one class than
  another. See [Storage classes](#storage-classes).
- `EncodingType` is read on `ListObjects` and `ListObjectsV2`. `ListMultipartUploads` and
  `ListParts` ignore it, and both answer on one page.
- ACLs and replication are left out. Server-side encryption is reported and never applied, and an
  `aws:kms` Object names no key, because there is no simulated KMS behind it. See
  [Default encryption](#default-encryption).
- A Bucket using filesystem-backed storage refuses a delete unless the mount allowed one, and hears
  nothing about a file something else wrote under the directory. See
  [Deleting the files under a mount](#deleting-the-files-under-a-mount).
- Multipart upload parts for a mounted Bucket are held in memory, and only the assembled Object
  reaches the directory.
- User-defined `x-amz-meta-` metadata is stored by every write and reported in `Metadata` by an
  in-process read. A response served over an endpoint carries the system metadata headers and leaves
  the user metadata out.
