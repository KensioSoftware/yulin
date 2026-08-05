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

## Static sites: default root object and error pages

A static site behind CloudFront usually leans on two Distribution settings: `DefaultRootObject`, so
a request for the site root returns the home page, and `CustomErrorResponses`, so a URL that matches
no object returns the site's own error page rather than the Origin's. Sim CloudFront applies both,
so a test can assert what a visitor would actually see.

```typescript sim-cloudfront-static-site
/**
 * Serving a static site with a default root object and a custom error page.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

  const pages = {
    "index.html": "<h1>Home</h1>",
    "404.html": "<h1>Page not found</h1>",
  };

  for (const [key, body] of Object.entries(pages)) {
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: key,
        ContentType: "text/html",
        Body: body,
      }),
    );
  }

  const distributionCreation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "static-site",
        Comment: "Static site",
        Enabled: true,
        DefaultRootObject: "index.html",
        CustomErrorResponses: {
          Quantity: 2,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
            {
              ErrorCode: 403,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "site-bucket.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distroHostname = distributionCreation.Distribution!.DomainName!;

  const home = await fetch(srv.localUrl(`http://${distroHostname}/`));
  console.log(await home.text()); // <h1>Home</h1>

  const missing = await fetch(srv.localUrl(`http://${distroHostname}/nowhere`));
  console.log(missing.status); // 404
  console.log(await missing.text()); // <h1>Page not found</h1>
} finally {
  srv.close();
}
```

The default root object stands in for a request to the root of the Distribution and nothing else. A
request for `/blog/` is passed to the Origin as it arrived, even where that folder holds its own
`index.html`, which is where CloudFront differs from an S3 website index document. The substituted
path is what the rest of request handling sees, so a Cache Behavior pattern and a `viewer-request`
CloudFront Function both act on the object being served rather than on the root. The value names an
object at the Origin, so it may be a path such as `public/index.html` but must not begin with a
forward slash: sim CloudFront refuses one that does with `InvalidDefaultRootObject`, rather than
creating a Distribution that answers its own root with a 403.

A custom error response replaces the Origin's response when its status matches `ErrorCode`, which is
one of the codes CloudFront supports: 400, 403, 404, 405, 414, 416, 500, 501, 502, 503 and 504. The
response page is fetched as a request in its own right, so the Cache Behavior matching
`ResponsePagePath` chooses which Origin it comes from, and error pages can live somewhere other than
the content that failed. `ResponseCode` is the status the viewer sees, which is how a single-page
app serves its shell with a 200 for a URL the Bucket has no object for. It is one of the same error
codes or 200, the set CloudFront allows. Where the response page is itself missing, the viewer gets
the status from fetching it, as in CloudFront.

Custom error responses are applied before a `viewer-response` CloudFront Function runs, so the
function sees the response the viewer is about to get. `ErrorCachingMinTTL` is accepted and ignored,
along with a rule that sets nothing else, because sim CloudFront has no cache to apply it to.

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

## Custom Origins

An Origin with a `CustomOriginConfig` is one CloudFront reaches over HTTP rather than as an S3
Bucket. Sim CloudFront resolves its `DomainName` in the simulated environment and serves the request
in process, so a Distribution can front a simulated HTTP API endpoint
(`<api-id>.execute-api.<region>.amazonaws.com`), a simulated Lambda Function URL
(`<url-id>.lambda-url.<region>.on.aws`), or anything a simulated Route53 record points at one of
those.

That covers the common arrangement of one Distribution serving static assets from a Bucket and
sending `/api/*` to an API:

```typescript sim-cloudfront-distribution-custom-origin
/**
 * A simulated CloudFront Distribution fronting a simulated HTTP API.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

// A Bucket holding the site.
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "index.html",
    Body: "<h1>Site</h1>",
  }),
);

// An HTTP API serving /api/things from a function.
const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "things",
    Role: "arn:aws:iam::111111111111:role/ThingsRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ things: ["kettle"] })) },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "things", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /api/things",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "things",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// One Distribution serving the site, with /api/* going to the API.
const distributionCreation = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "site-and-api",
      Comment: "Site and API CDN",
      Enabled: true,
      Origins: {
        Quantity: 2,
        Items: [
          {
            Id: "site-origin",
            DomainName: "site.s3.amazonaws.com",
            S3OriginConfig: { OriginAccessIdentity: "" },
          },
          {
            Id: "api-origin",
            DomainName: new URL(ApiEndpoint).hostname,
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "https-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/api/*",
            TargetOriginId: "api-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        ],
      },
    },
  }),
);

const distroHostname = distributionCreation.Distribution!.DomainName!;
const srv = await serveSimAws({ simAws });

try {
  const page = await fetch(srv.localUrl(`http://${distroHostname}/index.html`));
  const things = await fetch(
    srv.localUrl(`http://${distroHostname}/api/things`),
  );

  console.log(await page.text());
  console.log(await things.text());
} finally {
  srv.close();
}
```

The Origin domain is resolved when a request is served rather than when the Distribution is created,
so the Distribution and the service behind its Origin can be created in either order, whichever way
round a CloudFormation template happens to declare them.

`OriginPath` is prefixed to the request path, as it is for an S3 Origin, so an Origin path of `/v1`
sends a request for `/things` on to `/v1/things`.

A few things follow from the request never leaving the process:

- A domain that names nothing in the simulation fails with an error naming the Origin and the
  domain, rather than a real request being made to it. External HTTP Origins are not supported.
- The settings inside `CustomOriginConfig` describe how CloudFront connects over the network, so
  the protocol policy, ports, SSL protocols and timeouts are accepted and ignored.
- The Origin is reached anonymously, as CloudFront reaches an Origin with no Origin Access Control.
  A Function URL or an HTTP API route authorizing with `AWS_IAM` therefore refuses the request.

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

The `host` header a function sees is the hostname the request was made to CloudFront with: the
Distribution domain name, or one of its alternate domain names. Requests served on localhost arrive
with a Yulin-local host such as `distro123.cloudfront.net.sim-aws.localhost:52341`, and the local
suffix and port are dropped before the function runs, so a function building a URL from
`event.request.headers.host.value` behaves as it would on AWS. As on AWS, `host` is read-only: a
host a function writes is discarded rather than sent on to the Origin.

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
- Custom Origins reaching sim HTTP APIs and sim Lambda Function URLs in process
- CloudFront Distribution hostnames such as `distro123.cloudfront.net`
- Default cache Behavior and path-based cache Behaviors
- `DefaultRootObject` and `CustomErrorResponses`, for static sites and single-page apps
- `viewer-request` and `viewer-response` CloudFront Functions
- Viewer certificates from sim ACM, including CloudFront's `us-east-1` requirement
- Serving simulated CloudFront traffic on localhost with `serveSimAws`

The simulator focuses on useful behaviour for tests and local development rather than full CloudFront
feature parity. Unsupported CloudFront options may be ignored or may throw errors depending on
whether the simulator needs them to model the requested behaviour safely.
