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
- Bucket policies with `PutBucketPolicyCommand`, `GetBucketPolicyCommand` and
  `DeleteBucketPolicyCommand`, evaluated by sim IAM alongside identity policies
- Creating Buckets and Bucket policies from `AWS::S3::Bucket` and `AWS::S3::BucketPolicy`
- Block Public Access, on by default as in real S3, refusing a public Bucket policy unless the
  Bucket opts out with `PutPublicAccessBlockCommand` or `PublicAccessBlockConfiguration`
- Serving static website requests on localhost with `serveSimAws`
- Serving Object `GET`, `HEAD` and `PUT` over the S3 REST endpoint, authorized by sim IAM
- Presigned URLs built by the real `@aws-sdk/s3-request-presigner`, with expiry in simulated time
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

const objectContentItems = listObjectsOutput.Contents ?? [];
for (const object of objectContentItems) {
  console.log(object.Key, object.Size);
}
```

Object listings are sorted by key.

## Bucket policies

A Bucket policy is a resource policy stored on the Bucket. Sim IAM evaluates it alongside the
caller's identity policies whenever an Object command is authorized, so a policy can grant access to
a principal that holds no identity policy at all, including an anonymous caller.

Apply one with `PutBucketPolicyCommand`, read it back with `GetBucketPolicyCommand`, and remove it
with `DeleteBucketPolicyCommand`. Each is authorized in its own right, against `s3:PutBucketPolicy`,
`s3:GetBucketPolicy` and `s3:DeleteBucketPolicy`.

In a CloudFormation template, a Bucket policy is a separate `AWS::S3::BucketPolicy` resource rather
than a property of `AWS::S3::Bucket`. This is what CDK synthesizes for `bucket.grantRead(...)`,
`grantPut(...)` and `addToResourcePolicy(...)`, so a template reaches it whether or not the app
mentions a Bucket policy itself. Sim CloudFormation attaches it through the same `PutBucketPolicy`
path an SDK call takes, so the document is validated and enforced identically either way.

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

`GetBucketPolicyCommand` throws `NoSuchBucketPolicy` when the Bucket exists but has no policy, which
is how real S3 distinguishes that from a Bucket that does not exist. `DeleteBucketPolicyCommand`
succeeds either way, matching S3's idempotent behaviour.

A Bucket policy granting `Principal: "*"` is refused by default. See
[Block Public Access](#block-public-access) below.

## Block Public Access

Real S3 turns on all four Block Public Access settings for every new Bucket, and `BlockPublicPolicy`
makes `PutBucketPolicy` reject a policy that allows public access. Sim S3 does the same, so a Bucket
starts closed and a public Bucket policy is refused with `AccessDenied` until the Bucket opts out:

```typescript
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
  }),
);
```

The configuration you supply replaces the previous one wholesale, so a setting you leave out of it
is off rather than kept. That matches CDK: `BlockPublicAccess.BLOCK_ACLS` names only the two ACL
settings, and pairing it with `publicReadAccess: true` is the usual way to build a public website
Bucket.

`GetPublicAccessBlockCommand` reads the settings back and `DeletePublicAccessBlockCommand` removes
them, which returns the Bucket to fully blocked rather than leaving it open. In a CloudFormation
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

Only `BlockPublicPolicy` changes behaviour. The other three settings are stored and reported but do
nothing: `BlockPublicAcls` and `IgnorePublicAcls` govern ACLs, which are not modelled, and
`RestrictPublicBuckets` changes how an existing public policy is evaluated for cross-account callers
rather than rejecting a write, which is not yet simulated.

Anything the simulator cannot classify confidently counts as public and is refused, so it can be
stricter than real S3. A `NotPrincipal` statement, a statement with no `Principal`, and a
`Condition` on `aws:SourceIp` all count as public here. Real S3 accepts a sufficiently narrow
`aws:SourceIp` CIDR range as non-public; the simulator does not judge range breadth.

Account-level and organisation-level Block Public Access, access points, and `GetBucketPolicyStatus`
are not simulated.

The static website endpoint authorizes a request that names a principal as that principal, where a
real S3 website endpoint supports only publicly readable content and authenticates nothing. The
simulator is looser here, so a website reachable in a test as a named principal can be unreachable
in the same way against real S3.

Bucket ACLs and Object ownership settings are not modelled and are not planned. Object Ownership
defaults to Bucket owner enforced on new Buckets, which disables ACLs, and AWS recommends keeping
them disabled in favour of policies.

## Static website hosting

Configure Bucket website hosting with `PutBucketWebsiteCommand`.

Website hosting settles which Object answers a request, not who may read it. A browser asking for a
page is anonymous, and anonymous holds nothing unless a Bucket policy grants it, so a site with no
Bucket policy answers `403` to every ordinary visitor. That is what real S3 does, and it is the
mistake this most often catches: a site that works because nothing was checking. See
[Block Public Access](#block-public-access) for the two commands a public site needs; the localhost
serving example below shows them in place. The examples in this section configure hosting without
serving it, so they leave that out.

A request that does name a principal, through a signature or the `x-sim-aws-caller` header, is
authorized as that principal, so an identity policy granting `s3:GetObject` reaches the website
endpoint too. Real S3 has no such thing: its website endpoint supports only publicly readable
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
  srv.close();
}
```

The `getBucketWebsiteUrl(...)` method returns the simulated S3 website URL for the Bucket. The
`localUrl(...)` method on the localhost server adapts that URL so the request is sent to the local
server while preserving the simulated S3 website hostname.

## Presigned URLs

Sim S3 serves a REST API endpoint alongside the website endpoint, and it accepts presigned URLs
built by the real AWS presigner, `getSignedUrl` from `@aws-sdk/s3-request-presigner`. Nothing about
the signing is simulated: an `S3Client` is pointed at the simulated endpoint and signs as it would
against real S3, and sim IAM verifies the signature it produced.

Presigning is entirely client-side, so this works whether or not the URL is ever fetched over a real
socket. Install the presigner alongside the SDK:

```bash
npm install --save-dev @aws-sdk/s3-request-presigner
```

`simS3.getServiceUrl()` gives the endpoint to configure the client with. Sim S3 also has
`getBucketUrl(...)` for the virtual-hosted endpoint of one Bucket, though a client adds the Bucket
to the service endpoint for itself.

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
  srv.close();
}
```

A presigned URL grants exactly what the principal who signed it holds. Sim IAM resolves that
principal from the signature and authorizes `s3:GetObject` as them, so a user without permission
cannot presign around it. Temporary credentials from an STS `AssumeRoleCommand` work the same way,
carrying their session token in the URL.

A request to the REST endpoint that neither presents a signature nor names a principal in the
`x-sim-aws-caller` header is anonymous, and anonymous holds nothing unless a Bucket policy says
otherwise. That header is always enabled and wins over a signature, so a request driven by hand can
be any principal without signing anything, exactly as it can against the other simulated services
that serve HTTP. See
[the sim IAM docs](../iam/README.md#what-the-simulator-reports-back) for the whole boundary.

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

Presigned `PutObjectCommand` URLs work in the same way, and bring one trap worth knowing about. The
AWS SDK computes a checksum when it presigns, which is before there is a body to hash, and hoists it
into the signed URL. Uploading anything else through that URL then fails against real S3, and fails
here too, with `XAmzContentChecksumMismatch`. Build the client with
`requestChecksumCalculation: "WHEN_REQUIRED"` to presign upload URLs that accept a body:

```typescript
const s3Client = new S3Client({
  region: "eu-west-2",
  endpoint: srv.localUrl(simS3.getServiceUrl()).toString(),
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials,
});
```

### Limitations

- `GET`, `HEAD` and `PUT` of an Object are served over the REST endpoint. Bucket operations, `DELETE`
  and multipart uploads are not, and are refused with `501` rather than answered.
- `createPresignedPost` and SigV4A presigning are not simulated.
- Checksums are verified for CRC32, SHA1 and SHA256. An upload stating a CRC32C or CRC64NVME checksum
  is refused rather than stored unchecked.
- Responses carry no `ETag`, because sim S3 does not model Object entity tags.

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
