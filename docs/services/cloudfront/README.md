# Simulated CloudFront

Yulin includes a simulated CloudFront service for tests and local development.

Sim CloudFront can be used directly through `SimAws`, and it can also be served on localhost
alongside other simulated AWS services, so application code can make HTTP requests through a
CloudFront-like layer without talking to real AWS.

`SimCloudFront` can also be instantiated on its own, in which case it has its own isolated state that
is not connected to a wider simulated AWS environment.

## Basic Distribution setup

Create a simulated AWS environment, add a sim S3 Bucket, and create a sim CloudFront Distribution
pointing at that Bucket.

```typescript sim-cloudfront-distribution-s3-origin
/**
 * Creating a simulated CloudFront Distribution with a simulated S3 Origin.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();
const simCloudFront = simAws.cloudFront();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

const distributionCreation = await simCloudFront.createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "assets-cdn",
      Comment: "Assets CDN",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "assets-origin",
            DomainName: "foo-bucket.s3.amazonaws.com",
            S3OriginConfig: {
              OriginAccessIdentity: "",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "assets-origin",
        ViewerProtocolPolicy: "allow-all",
      },
    },
  }),
);

console.log(distributionCreation.Distribution?.DomainName);
```

## Serve simulated CloudFront on localhost

Use `serveSimAws` when you want to make real HTTP requests to the simulated system on localhost.

```typescript serve-sim-cloudfront-localhost
/**
 * Serving a simulated CloudFront Distribution on localhost.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();
  const simCloudFront = simAws.cloudFront();

  await simS3.createBucket(
    new CreateBucketCommand({
      Bucket: "foo-bucket",
    }),
  );

  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "foo-bucket",
      Key: "hello.txt",
      Body: "Hello from simulated CloudFront",
    }),
  );

  const distributionCreation = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "localhost-assets-cdn",
        Comment: "Localhost Assets CDN",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "assets-origin",
              DomainName: "foo-bucket.s3.amazonaws.com",
              S3OriginConfig: {
                OriginAccessIdentity: "",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "assets-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distroHostname = distributionCreation.Distribution!.DomainName!;

  const url = srv.localUrl(`http://${distroHostname}/hello.txt`);
  const response = await fetch(url);

  console.log(response.status);
  console.log(await response.text());
} finally {
  srv.close();
}
```

The Distribution domain is adapted through `server.localUrl(...)` so that the request is sent to the
local Yulin server while preserving the simulated CloudFront hostname.

## Viewer certificates

A Distribution with alternate domain names needs an ACM certificate, and CloudFront accepts only
certain ones. Sim CloudFront applies the same rules, so a Distribution that real CloudFront would
reject at deploy time is rejected here first, with `InvalidViewerCertificate`:

- the certificate must be in `us-east-1`, wherever the rest of your infrastructure lives;
- the certificate must exist and be `ISSUED`;
- every alternate domain name must be covered by the certificate's domain name or one of its subject
  alternative names, with a wildcard covering exactly one label.

The `us-east-1` rule is easy to miss, because nothing else in a stack cares about it. A Distribution
in `eu-west-2` with a certificate alongside it looks fine until CloudFront refuses it.

```typescript sim-cloudfront-viewer-certificate
/**
 * Catching an ACM certificate CloudFront will not accept.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A certificate alongside the rest of the stack, rather than in us-east-1.
const requestOutput = await simAws
  .region("eu-west-2")
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "example.test" }),
  );

await simAws.backgroundTasksComplete();

try {
  await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "site-distribution",
        Comment: "Site distribution",
        Enabled: true,
        Aliases: { Quantity: 1, Items: ["example.test"] },
        Origins: { Quantity: 0, Items: [] },
        DefaultCacheBehavior: {
          TargetOriginId: "origin",
          ViewerProtocolPolicy: "redirect-to-https",
        },
        ViewerCertificate: {
          ACMCertificateArn: requestOutput.CertificateArn,
          SSLSupportMethod: "sni-only",
        },
      },
    }),
  );
} catch (error) {
  // InvalidViewerCertificate: ... is in eu-west-2, but CloudFront only accepts
  // ACM Certificates in us-east-1
  console.log((error as Error).message);
}
```

The CloudFront API and CloudFormation capitalise this field differently, and sim CloudFront accepts
both. SDK calls use `ACMCertificateArn` and `SSLSupportMethod`, as above.
`AWS::CloudFront::Distribution` uses `AcmCertificateArn` and `SslSupportMethod`, so a template or
CDK app works without changes.

A Distribution using `CloudFrontDefaultCertificate` needs no ACM certificate and is not checked. A
standalone `new SimCloudFront()` has no sim ACM to check against, so it does not check either.

## Simulated CloudFront Functions

The sim CloudFront supports `viewer-request` and `viewer-response` CloudFront Functions.

Use `makeCffFunctionCodeInput` to pass a JavaScript handler function to `CreateFunctionCommand`.

```typescript sim-cloudfront-function
/**
 * Simulated CloudFront Functions.
 */

import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import {
  makeCffFunctionCodeInput,
  type CloudFrontFunction,
} from "@kensio/yulin/cloudfront";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();
  const simCloudFront = simAws.cloudFront();

  await simS3.createBucket(
    new CreateBucketCommand({
      Bucket: "foo-bucket",
    }),
  );

  function viewerRequestFunction(
    event: CloudFrontFunction.ViewerRequestEvent,
  ): CloudFrontFunction.Request | CloudFrontFunction.Response {
    if (event.request.uri === "/old-page.html") {
      return {
        statusCode: 302,
        statusDescription: "Found",
        headers: {
          location: {
            value: "https://example.test/new-page.html",
          },
        },
      };
    }

    return event.request;
  }

  const functionCreation = await simCloudFront.createFunction(
    new CreateFunctionCommand({
      Name: "redirect-old-page",
      FunctionConfig: {
        Comment: "Redirect old page",
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: makeCffFunctionCodeInput(viewerRequestFunction),
    }),
  );

  const distributionCreation = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "function-cdn",
        Comment: "Function CDN",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "assets-origin",
              DomainName: "foo-bucket.s3.amazonaws.com",
              S3OriginConfig: {
                OriginAccessIdentity: "",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "assets-origin",
          ViewerProtocolPolicy: "allow-all",
          FunctionAssociations: {
            Quantity: 1,
            Items: [
              {
                EventType: "viewer-request",
                FunctionARN: functionCreation.FunctionMetadata.FunctionARN,
              },
            ],
          },
        },
      },
    }),
  );

  const distroHostname = distributionCreation.Distribution!.DomainName!;

  const url = srv.localUrl(`http://${distroHostname}/old-page.html`);
  const response = await fetch(url, { redirect: "manual" });

  console.log(response.status);
  console.log(response.headers.get("location"));
} finally {
  srv.close();
}
```

If your CloudFront Function code lives in a module that exports the handler, use
`cloudFrontFunctionSourceFromModule` in your CDK Stack to load it as inline CloudFront Function
code. This lets the same function file use an export like `export function handler(...)` while
still being accepted by CloudFront Function inline code.

```typescript sim-cloudfront-function-module-export
/**
 * cloudFrontFunctionSourceFromModule util function
 */

import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";

import { cloudFrontFunctionSourceFromModule } from "@kensio/yulin/cloudfront";

/**
 * Example CDK stack using cloudFrontFunctionSourceFromModule to extract source
 * code for a CloudFront Function handler from a module that uses `export`.
 */
export class WebsiteStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new cloudfront.Function(this, "RewriteFunction", {
      code: cloudfront.FunctionCode.fromInline(
        cloudFrontFunctionSourceFromModule("src/cff/rewrite.cff.js"),
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });
  }
}
```

The referenced CloudFront Function module can then keep an exported handler:

```javascript
/**
 * @typedef {import("@kensio/yulin/cloudfront").CloudFrontFunction.Event} CloudFrontEvent
 * @typedef {import("@kensio/yulin/cloudfront").CloudFrontFunction.Request} CloudFrontRequest
 * @typedef {import("@kensio/yulin/cloudfront").CloudFrontFunction.Response} CloudFrontResponse
 */

/**
 * Handles a CloudFront Functions viewer request event.
 * @param {CloudFrontEvent} event - The CloudFront Functions event object.
 * @returns {CloudFrontRequest|CloudFrontResponse} A CloudFront request object or response object.
 */
export function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.includes(".") && !uri.endsWith("/")) {
    request.uri += "/index.html";
  }

  return request;
}
```

## Available functionality

Sim CloudFront currently supports:

- `CreateDistributionCommand` and `GetDistributionCommand`
- S3 Origins backed by sim S3 Buckets
- CloudFront Distribution hostnames such as `distro123.cloudfront.net`
- Default cache Behavior and path-based cache Behaviors
- `viewer-request` and `viewer-response` CloudFront Functions
- Viewer certificates from sim ACM, including CloudFront's `us-east-1` requirement
- Serving simulated CloudFront traffic on localhost with `serveSimAws`

The simulator focuses on useful behaviour for tests and local development rather than full CloudFront
feature parity. Unsupported CloudFront options may be ignored or may throw errors depending on
whether the simulator needs them to model the requested behaviour safely.
