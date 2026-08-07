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
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();
const simCloudFront = simAws.cloudFront();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

// The Origin below has no origin access control, so it reads the Bucket
// anonymously and only a public read grant lets it serve anything.
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "foo-bucket",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await simS3.putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "foo-bucket",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::foo-bucket/*",
      },
    }),
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

## What an S3 Origin can read

An S3 Origin reads its Bucket through the ordinary GetObject command, so the Bucket policy decides
what the Distribution can serve. An Origin with no origin access control reads anonymously, which is
the unsigned request real CloudFront sends to the S3 REST endpoint, so an Object has to be publicly
readable for the Distribution to serve it. A Bucket with no policy answers 403 for every Object.

An Origin that does have an origin access control reads as the CloudFront service principal instead,
so the Bucket stays private and its policy names the Distribution. See
[Origin access controls](#origin-access-controls) for the policy that needs.

That is the two commands in the example above: `PutPublicAccessBlockCommand` to opt out of the block
on public Bucket policies, then `PutBucketPolicyCommand` granting `s3:GetObject` to `Principal: "*"`.
The same pair is what a static website Bucket needs, and it is what CDK's `publicReadAccess: true`
generates.

A denied read reaches the viewer as a 403 from the Origin, so a Distribution's custom error response
for 403 replaces it. That is what makes the usual single-page-app setup, rewriting 403 to
`/index.html`, behave here as it does in AWS.

`S3OriginConfig.OriginAccessIdentity` is refused rather than read as anonymous. Leave it empty, as
CloudFront itself writes it for an Origin that signs nothing.

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
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

  // A CloudFront S3 Origin with no origin access control reads the Bucket
  // anonymously, so what it serves has to be publicly readable.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "site-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "site-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::site-bucket/*",
        },
      }),
    }),
  );

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
  await srv.close();
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
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

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

  // A CloudFront S3 Origin with no origin access control reads the Bucket
  // anonymously, so what it serves has to be publicly readable.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "foo-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "foo-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::foo-bucket/*",
        },
      }),
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
  await srv.close();
}
```

The Distribution domain is adapted through `server.localUrl(...)` so that the request is sent to the
local Yulin server while preserving the simulated CloudFront hostname.

A test that needs no browser can skip the port. `SimAwsHttp` answers the same requests in the
process, with no server listening and nothing to adapt the URL for, and an alternate domain name a
simulated Route53 answers for is requested by its own name: `simAwsHttp.fetch("https://cdn.example.test/")`
reaches the Distribution behind it. See
[requests without a port](../../serve/#requests-without-a-port "Requests without a port docs").

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
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

// A Bucket holding the site, readable by the Origin that reads it anonymously.
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "index.html",
    Body: "<h1>Site</h1>",
  }),
);
await simAws.s3().putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await simAws.s3().putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "site",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::site/*",
      },
    }),
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
  await srv.close();
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

## Disabling and deleting a Distribution

`DeleteDistributionCommand` removes a Distribution. CloudFront will not delete one that is still
serving, so the sequence is `UpdateDistributionCommand` with `Enabled: false` first, then the
deletion. Deleting an enabled Distribution answers `DistributionNotDisabled`, as it does in AWS.

`UpdateDistributionCommand` takes a whole `DistributionConfig` rather than a patch, so the update is
applied as a replacement. Anything left out of the new config is dropped, including alternate domain
names and the default root object. Read the Distribution first, change the field you want, and send
the config back.

Once the Distribution is deleted, a request to its CloudFront domain or any of its alternate domain
names no longer resolves to it, and those alternate domain names are free for another Distribution.

```typescript sim-cloudfront-delete-distribution
/**
 * Disabling a simulated CloudFront Distribution and then deleting it.
 */

import {
  CreateDistributionCommand,
  DeleteDistributionCommand,
  type DistributionConfig,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCloudFront = simAws.cloudFront();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

const distributionConfig: DistributionConfig = {
  CallerReference: "site-distribution",
  Comment: "Site distribution",
  Enabled: true,
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
};

const created = await simCloudFront.createDistribution(
  new CreateDistributionCommand({ DistributionConfig: distributionConfig }),
);
await simAws.backgroundTasksComplete();

const distributionId = created.Distribution?.Id;

try {
  await simCloudFront.deleteDistribution(
    new DeleteDistributionCommand({ Id: distributionId }),
  );
} catch (error) {
  // DistributionNotDisabled: Sim CloudFront Distribution ... is enabled, so it
  // cannot be deleted. Disable it with UpdateDistribution first.
  console.log((error as Error).message);
}

// Disable the Distribution, then delete it.
await simCloudFront.updateDistribution(
  new UpdateDistributionCommand({
    Id: distributionId,
    DistributionConfig: { ...distributionConfig, Enabled: false },
  }),
);
await simAws.backgroundTasksComplete();

await simCloudFront.deleteDistribution(
  new DeleteDistributionCommand({ Id: distributionId }),
);

try {
  await simCloudFront.getDistribution(
    new GetDistributionCommand({ Id: distributionId }),
  );
} catch (error) {
  // NoSuchDistribution: No sim CloudFront Distribution with ID ...
  console.log((error as Error).message);
}
```

`DeleteFunctionCommand` removes a CloudFront Function by name, and answers `NoSuchFunctionExists`
when the name matches nothing. A cache Behavior still pointing at a deleted Function finds nothing
and runs no Function code.

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
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

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

  // A CloudFront S3 Origin with no origin access control reads the Bucket
  // anonymously, so what it serves has to be publicly readable.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "foo-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "foo-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::foo-bucket/*",
        },
      }),
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
  await srv.close();
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

CloudFront Functions run JS2, which is ECMAScript 5.1 plus a named subset of ES 6 to 12, so it
refuses constructs ordinary JavaScript allows. Yulin publishes ESLint and Oxlint configs that report
those refusals in the editor rather than at publication. See
[Linting CloudFront Functions JS2](../../lint/ "CloudFront Functions JS2 lint config usage docs").

## Response headers policies

A response headers policy sets headers on everything a cache Behavior serves. Declare one as
`AWS::CloudFront::ResponseHeadersPolicy` and point a Behavior's `ResponseHeadersPolicyId` at it with
a `Ref`, which is what CDK's `ResponseHeadersPolicy` construct synthesizes.

```typescript sim-cloudfront-response-headers-policy
/**
 * Setting response headers on what a cache Behavior serves.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "site-bucket",
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
            },
          },
        },
        // The Origin reads the Bucket anonymously, so the site needs a policy
        // making it publicly readable.
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          DependsOn: "SiteBucket",
          Properties: {
            Bucket: "site-bucket",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::site-bucket/*",
              },
            },
          },
        },
        CacheHeaders: {
          Type: "AWS::CloudFront::ResponseHeadersPolicy",
          Properties: {
            ResponseHeadersPolicyConfig: {
              Name: "CacheHeaders",
              CustomHeadersConfig: {
                Items: [
                  {
                    Header: "Cache-Control",
                    Override: true,
                    Value: "public, max-age=0, must-revalidate",
                  },
                ],
              },
            },
          },
        },
        SiteDistribution: {
          Type: "AWS::CloudFront::Distribution",
          DependsOn: ["SiteBucket", "CacheHeaders"],
          Properties: {
            DistributionConfig: {
              DefaultRootObject: "index.html",
              Origins: [
                {
                  Id: "SiteOrigin",
                  DomainName: "site-bucket.s3.amazonaws.com",
                  S3OriginConfig: {},
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                ResponseHeadersPolicyId: { Ref: "CacheHeaders" },
              },
            },
          },
        },
      },
      Outputs: {
        DistributionDomainName: {
          Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "index.html",
      ContentType: "text/html",
      Body: "<h1>Home</h1>",
    }),
  );

  const domainName = stack.outputs.get("DistributionDomainName")
    ?.value as string;
  const response = await fetch(srv.localUrl(`http://${domainName}/`));

  console.log(response.headers.get("cache-control"));
} finally {
  await srv.close();
}
```

Each header in `CustomHeadersConfig` carries an `Override` boolean. With it set, the policy's value
replaces one the Origin sent. Without it, the Origin's value is kept and the policy's is dropped. A
header the Origin did not send is added either way.

`RemoveHeadersConfig` takes headers away, and is applied before the added ones, so a header named in
both sections ends up present with the policy's value.

The policy is applied after a custom error response is fetched and before a `viewer-response`
CloudFront Function runs, as CloudFront does. An error page carries the policy's headers, and a
function sees them in `event.response.headers` and can change them.

## Origin access controls

An origin access control is how a Distribution authenticates to a private S3 Bucket. Declare one as
`AWS::CloudFront::OriginAccessControl` and point an Origin's `OriginAccessControlId` at it with a
`Ref`, which is what CDK's `S3BucketOrigin.withOriginAccessControl` synthesizes.

An Origin whose origin access control signs reads its Bucket as the `cloudfront.amazonaws.com`
service principal, carrying the Distribution's ARN as `aws:SourceArn`. The Bucket policy is then the
whole decision, so the Bucket needs a statement granting `s3:GetObject` to that principal,
conditioned on the Distribution allowed to read it. That is the policy CDK writes. A condition
naming a different Distribution, or an Origin that was never given an origin access control,
answers 403 rather than serving.

```typescript sim-cloudfront-origin-access-control
/**
 * Serving a private S3 Bucket through an origin access control.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "site-bucket" },
        },
        SiteOac: {
          Type: "AWS::CloudFront::OriginAccessControl",
          Properties: {
            OriginAccessControlConfig: {
              Name: "site-oac",
              OriginAccessControlOriginType: "s3",
              SigningBehavior: "always",
              SigningProtocol: "sigv4",
            },
          },
        },
        SiteDistribution: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              Enabled: true,
              DefaultRootObject: "index.html",
              Origins: [
                {
                  Id: "SiteOrigin",
                  DomainName: "site-bucket.s3.amazonaws.com",
                  S3OriginConfig: {},
                  OriginAccessControlId: { Ref: "SiteOac" },
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
              },
            },
          },
        },
        // Nothing but this Distribution may read the Bucket, which is what the
        // condition on the Distribution's ARN says.
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "SiteBucket" },
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "cloudfront.amazonaws.com" },
                  Action: "s3:GetObject",
                  Resource: "arn:aws:s3:::site-bucket/*",
                  Condition: {
                    StringEquals: {
                      "AWS:SourceArn": {
                        "Fn::Join": [
                          "",
                          [
                            "arn:aws:cloudfront::",
                            { Ref: "AWS::AccountId" },
                            ":distribution/",
                            { Ref: "SiteDistribution" },
                          ],
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      Outputs: {
        SiteHostname: {
          Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "index.html",
      ContentType: "text/html",
      Body: "<h1>Home</h1>",
    }),
  );

  const siteHostname = stack.outputs.get("SiteHostname")?.value as string;
  const home = await fetch(srv.localUrl(`http://${siteHostname}/`));

  console.log(await home.text()); // <h1>Home</h1>
} finally {
  await srv.close();
}
```

The Bucket policy names the Distribution's ARN, so it is created after the Distribution: the `Ref`
inside `Fn::Join` is the dependency CloudFormation orders the Stack by. Nothing about the read is
settled when the Distribution is created, because the policy deciding it does not exist yet. The
Origin works out who it is reading as per request instead.

`SigningBehavior` takes any of `always`, `never` and `no-override`. `always` and `no-override` both
sign, since nothing here sends a pre-signed viewer request to an Origin for `no-override` to pass
through. `never` turns the origin access control off without removing it, so the Origin reads
anonymously and needs a Bucket policy allowing that, as an Origin with no origin access control
does.

`Ref` and `Fn::GetAtt` on `Id` both return the ID, so either resolves an Origin's
`OriginAccessControlId`. An Origin naming an ID no origin access control holds is refused with
`InvalidOriginAccessControl` when the Distribution is created, rather than created without one.
Tearing the Stack down removes the origin access control, and its name is free again.

`OriginAccessControlOriginType` must be `s3` and `SigningProtocol` must be `sigv4`. Any other value
fails the Stack by name.

There is no `CreateOriginAccessControl` command here, so a CloudFormation template is the only way
to make one.

## Available functionality

Sim CloudFront currently supports:

- `CreateDistributionCommand`, `GetDistributionCommand`, `UpdateDistributionCommand` and
  `DeleteDistributionCommand`
- `CreateFunctionCommand` and `DeleteFunctionCommand`
- S3 Origins backed by sim S3 Buckets, reading them as the Bucket policy allows
- Custom Origins reaching sim HTTP APIs and sim Lambda Function URLs in process
- CloudFront Distribution hostnames such as `distro123.cloudfront.net`
- Default cache Behavior and path-based cache Behaviors
- `DefaultRootObject` and `CustomErrorResponses`, for static sites and single-page apps
- `viewer-request` and `viewer-response` CloudFront Functions
- `AWS::CloudFront::ResponseHeadersPolicy`, for headers a cache Behavior sets on every response
- `AWS::CloudFront::OriginAccessControl`, so an Origin reads a private Bucket as CloudFront
- Viewer certificates from sim ACM, including CloudFront's `us-east-1` requirement
- Serving simulated CloudFront traffic on localhost with `serveSimAws`

The simulator focuses on useful behaviour for tests and local development rather than full CloudFront
feature parity. Unsupported CloudFront options may be ignored or may throw errors depending on
whether the simulator needs them to model the requested behaviour safely.

## Limitations

Where sim CloudFront knowingly behaves differently from AWS:

- **An S3 Origin with no origin access control reads its Bucket anonymously.** That is the unsigned
  request real CloudFront sends to the S3 REST endpoint without one, so the Bucket policy has to
  make an Object publicly readable for the Distribution to serve it. A legacy
  `S3OriginConfig.OriginAccessIdentity` is refused by name rather than read as anonymous: it signs
  the Origin request as a CloudFront canonical user nothing here models, so a Bucket policy written
  for one would deny the read and say nothing about why.
- **A signed Origin request is not really signed.** An Origin whose origin access control signs
  reads the Bucket as the `cloudfront.amazonaws.com` service principal carrying the Distribution's
  ARN, which is what the Bucket policy is evaluated against, but no SigV4 signature is computed or
  checked. Nothing else here signs a simulated request either, so a test cannot assert anything
  about the signature itself.
- **An origin access control is only accepted for an S3 Origin with SigV4.** CloudFront also signs for
  MediaStore, MediaPackage V2 and Lambda Function URL Origins, and none of those is modelled. An
  `OriginAccessControlOriginType` other than `s3`, or a `SigningProtocol` other than `sigv4`, fails
  the Stack by naming the value, rather than deploying and behaving like an S3 one. For the same
  reason, a custom Origin naming an origin access control is refused.
- **An origin access control name is unique, but nothing else about it is checked.** A second one
  claiming a name is refused with `OriginAccessControlAlreadyExists`, as CloudFront refuses one.
- **There is no command surface for an origin access control.** `CreateOriginAccessControl` and its
  siblings are not simulated, so `AWS::CloudFront::OriginAccessControl` is the only way to make one.
- **`IfMatch` ETags are not checked.** `UpdateDistributionCommand`, `DeleteDistributionCommand` and
  `DeleteFunctionCommand` all accept `IfMatch` and ignore it, so neither `PreconditionFailed` nor
  `InvalidIfMatchVersion` is ever returned. Nothing else here versions a resource, and a stale ETag
  is a retry rather than a design mistake. A test expecting the ETag refusal will not get it.
- **A deletion does not wait for the disable to deploy.** Real CloudFront needs the disabled
  Distribution to reach `Deployed` before it accepts the deletion. Here, `Enabled: false` is enough.
- **A disabled Distribution still serves requests.** Real CloudFront answers a disabled Distribution
  with a 403. Only deleting a Distribution stops it serving here.
- **`DeleteFunctionCommand` never answers `FunctionInUse`.** Nothing tells a CloudFront Function that
  a cache Behavior has taken it up, so every Function is deletable. A Behavior left pointing at a
  deleted Function runs no Function code.
- **A response headers policy sets custom headers and removes named ones, and nothing else.** The
  `CorsConfig`, `SecurityHeadersConfig` and `ServerTimingHeadersConfig` sections each set headers of
  their own, and none of them is modelled. A policy declaring one fails the stack by naming the
  section, rather than deploying and then serving responses missing the headers it promised.
- **A response headers policy name is unique, but nothing else about it is checked.** A second
  policy claiming a name is refused with `ResponseHeadersPolicyAlreadyExists`, as CloudFront refuses
  one. The header names and values themselves are stored as written.
- **There is no command surface for a response headers policy.** `CreateResponseHeadersPolicy` and
  its siblings are not simulated, so `AWS::CloudFront::ResponseHeadersPolicy` is the only way to make
  one.
- **A managed policy ID is not found.** CloudFront's managed policies belong to AWS rather than to a
  template, so nothing here creates them. A Behavior naming one is refused with
  `NoSuchResponseHeadersPolicy` when a request reaches it, rather than serving a response without the
  headers the policy would have set.
