# Simulated CloudFront

Yulin includes a simulated CloudFront service for tests and local development.

Sim CloudFront can be used directly through `SimAws`, and it can also be served on localhost
alongside other simulated AWS services, so application code can make HTTP requests through a
CloudFront-like layer without talking to real AWS.

`SimCloudFront` can also be instantiated on its own, in which case it has its own isolated state,
standing apart from any wider simulated AWS environment.

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

An S3 Origin reads its Bucket through the ordinary GetObject command. The Bucket policy decides what
the Distribution can serve. An Origin with no origin access control reads anonymously, the unsigned
request real CloudFront sends to the S3 REST endpoint. An Object has to be publicly readable for the
Distribution to serve it, and a Bucket with no policy answers 403 for every Object.

An Origin that does have an origin access control reads as the CloudFront service principal. The
Bucket stays private and its policy names the Distribution. See
[Origin access controls](#origin-access-controls) for the Bucket policy that takes.

That is what the two commands in the example above do. `PutPublicAccessBlockCommand` opts out of the
block on public Bucket policies, then `PutBucketPolicyCommand` grants `s3:GetObject` to
`Principal: "*"`. The same pair is what a static website Bucket needs, and it is what CDK's
`publicReadAccess: true` generates.

A denied read reaches the viewer as a 403 from the Origin, and a Distribution's custom error
response for 403 replaces it. The usual single-page-app setup, rewriting 403 to `/index.html`,
behaves here as it does in AWS.

`S3OriginConfig.OriginAccessIdentity` is refused. Leave it empty, as CloudFront itself writes it for
an Origin that signs nothing.

## Static sites, default root objects and error pages

A static site behind CloudFront usually leans on two Distribution settings. `DefaultRootObject`
makes a request for the site root return the home page. `CustomErrorResponses` makes a URL that
matches no object return the site's own error page in place of the Origin's. Sim CloudFront applies
both, and a test can assert what a visitor would actually see.

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
`index.html`. That is where CloudFront differs from an S3 website index document. The substituted
path is what the rest of request handling sees, and a Cache Behavior pattern and a `viewer-request`
CloudFront Function both act on the object being served. The value names an object at the Origin. It may be a
path such as `public/index.html`, and it must not begin with a forward slash. Sim CloudFront refuses one that does with `InvalidDefaultRootObject`. The alternative would
be a Distribution that answers its own root with a 403.

A custom error response replaces the Origin's response when its status matches `ErrorCode`. The
codes CloudFront supports are 400, 403, 404, 405, 414, 416, 500, 501, 502, 503 and 504. The response
page is fetched as a request in its own right, and the Cache Behavior matching `ResponsePagePath`
chooses which Origin it comes from. Error pages can live somewhere other than the content that
failed. `ResponseCode` is the status the viewer sees. That is how a single-page app serves its shell
with a 200 for a URL the Bucket has no object for. It is one of the same error codes or 200, the set
CloudFront allows. Where the response page is itself missing, the viewer gets the status from
fetching it, as in CloudFront.

A viewer-response function never sees a custom error page. CloudFront runs no viewer-response
function once the Origin has answered 400 or higher, and simulated CloudFront does the same, for a
CloudFront Function and a Lambda@Edge function alike. The status the Origin returned is what decides
that, whatever `ResponseCode` puts in its place. `ErrorCachingMinTTL` is accepted and ignored, along
with a rule that sets nothing else, since sim CloudFront has no cache to apply it to.

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
process, with no server listening and no URL to adapt. An alternate domain name a simulated Route53
answers for is requested by its own name, and `simAwsHttp.fetch("https://cdn.example.test/")` reaches
the Distribution behind it. See
[requests without a port](https://yulinsim.dev/serve/#requests-without-a-port "Requests without a port docs").

## Custom Origins

An Origin with a `CustomOriginConfig` is one CloudFront reaches over HTTP, in place of reading an S3
Bucket. Sim CloudFront resolves its `DomainName` in the simulated environment and serves the request
in process. A Distribution can front a simulated HTTP API endpoint
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

The Origin domain is resolved when a request is served, and the Distribution and the service behind
its Origin can be created in either order, whichever way round a CloudFormation template happens to
declare them.

`OriginPath` is prefixed to the request path, as it is for an S3 Origin. An Origin path of `/v1`
sends a request for `/things` on to `/v1/things`.

Three things follow from the request never leaving the process:

- A domain unknown to the simulation fails with an error naming the Origin and the
  domain. No real request is made to it, and external HTTP Origins are unsupported.
- The settings inside `CustomOriginConfig` describe how CloudFront connects over the network. The
  protocol policy, ports, SSL protocols and timeouts are accepted and ignored.
- The Origin is reached anonymously unless it has an origin access control, as CloudFront reaches an
  Origin it has nothing to sign for. A Function URL or an HTTP API route authorizing with `AWS_IAM`
  therefore refuses the request. [Origin access controls](#origin-access-controls) covers the
  Function URL that admits the Distribution and nothing else.

## Custom headers on an Origin

CloudFront adds an Origin's custom headers to every request it sends that Origin. An origin that
answers only requests carrying a header nothing else knows is how AWS documents
[restricting a custom origin to CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html#forward-custom-headers-restrict-access),
and a sim Distribution sends them the same way.

The CloudFront API and CloudFormation name the field differently, and both spellings are accepted
here. The API has `CustomHeaders` inside an `Origin`, and `AWS::CloudFront::Distribution` has
`OriginCustomHeaders`, as the two differ over the viewer certificate ARN.

```typescript sim-cloudfront-origin-custom-headers
/**
 * An HTTP API answering only the requests that came through the Distribution.
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

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const originSecret = "5d6e2b0c6f564c1e9d5b2f1a5b8c9d70";

// A function serving the API, which reads the secret off every request.
const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "profile",
    Role: "arn:aws:iam::111111111111:role/ProfileRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { headers: Record<string, string> }) =>
          event.headers["x-origin-secret"] === originSecret
            ? { name: "Ada" }
            : { message: "Forbidden" },
      ),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "profile", ProtocolType: "HTTP" }),
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
    RouteKey: "GET /user/profile",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "profile",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// A Distribution that sends the secret with every request to that Origin.
const distributionCreation = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "user-site",
      Comment: "User API CDN",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "api-origin",
            DomainName: new URL(ApiEndpoint).hostname,
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "https-only",
            },
            CustomHeaders: {
              Quantity: 1,
              Items: [
                { HeaderName: "x-origin-secret", HeaderValue: originSecret },
              ],
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "api-origin",
        ViewerProtocolPolicy: "allow-all",
      },
    },
  }),
);

const distroHostname = distributionCreation.Distribution!.DomainName!;
const srv = await serveSimAws({ simAws });

try {
  const throughCdn = await fetch(
    srv.localUrl(`http://${distroHostname}/user/profile`),
  );
  const direct = await fetch(srv.localUrl(`${ApiEndpoint}/user/profile`));

  // {"name":"Ada"}
  console.log(await throughCdn.text());
  // {"message":"Forbidden"}
  console.log(await direct.text());
} finally {
  await srv.close();
}
```

Two rules follow CloudFront's own:

- A header the viewer already sent is overwritten with the Origin's value, whatever case the viewer
  wrote it in. A viewer cannot reach the origin with a guessed secret by sending the header through
  the Distribution.
- A header name CloudFront refuses to add fails the Distribution at create and fails the Stack at
  deploy, naming the header. The
  [denied names](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html#add-origin-custom-headers-denylist)
  run from `Cache-Control` to `X-Real-Ip`, along with anything beginning `X-Amz-` or `X-Edge-`.

An S3 Origin takes the headers and reaches nothing with them. Sim CloudFront reads a Bucket through
`GetObject` and builds no HTTP request for a header to travel on, and real S3 ignores a header it
has no use for.

## An Origin declared twice

Two Origins over one domain name are ordinary. They differ by `OriginPath`, by their custom headers
or by how CloudFront connects, and a Behavior points at whichever one it wants.

Two Origins that match in every property but the `Id` are one Origin written twice. Copying a
Behavior and its Origin together, then editing the path pattern, leaves exactly that behind. Sim
CloudFront keys an Origin by `Id`, as CloudFront does, and serves both Behaviors alike. An account
has been seen to serve them differently, refusing every request on the second Behavior at the
Origin. Why it did that is unconfirmed.

The Distribution records each repeat as it is created or updated, and warns about it on the console.
Each entry in `redundantOrigins` names the Origin, the earlier Origin it repeats and the domain both
of them name. A test can assert the list is empty.

```typescript sim-cloudfront-redundant-origins
/**
 * Catching an Origin a Distribution declares twice.
 */

import {
  CreateDistributionCommand,
  type Origin,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simCloudFront = new SimAws().cloudFront();

// The two Behaviors below were written by copying one of them, so the second
// Origin says everything the first one says.
const apiOrigin = (originId: string): Origin => ({
  Id: originId,
  DomainName: "api.example.test",
  CustomOriginConfig: {
    HTTPPort: 80,
    HTTPSPort: 443,
    OriginProtocolPolicy: "https-only",
  },
  CustomHeaders: {
    Quantity: 1,
    Items: [
      {
        HeaderName: "x-origin-secret",
        HeaderValue: "5d6e2b0c6f564c1e9d5b2f1a5b8c9d70",
      },
    ],
  },
});

const creation = await simCloudFront.createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "user-site",
      Comment: "User API CDN",
      Enabled: true,
      Origins: {
        Quantity: 2,
        Items: [apiOrigin("live-origin"), apiOrigin("preview-origin")],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "live-origin",
        ViewerProtocolPolicy: "allow-all",
      },
      CacheBehaviors: {
        Quantity: 1,
        Items: [
          {
            PathPattern: "/preview/*",
            TargetOriginId: "preview-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        ],
      },
    },
  }),
);

const distribution = simCloudFront.getSimDistributionById(
  creation.Distribution!.Id!,
);

// [
//   {
//     originId: "preview-origin",
//     repeatsOriginId: "live-origin",
//     domainName: "api.example.test",
//   },
// ]
console.log(distribution?.redundantOrigins);
```

Sameness is every property the config declares apart from the `Id`, and not only the properties the
simulation reads. An Origin differing by a connection setting sim CloudFront ignores is left alone.
A property written as an empty string counts as one left out, and custom headers count by name and
value however they were ordered or cased.

## Viewer certificates

A Distribution with alternate domain names needs an ACM certificate, and CloudFront accepts only
certain ones. Sim CloudFront applies the same rules. A Distribution that real CloudFront would
reject at deploy time is rejected here first, with `InvalidViewerCertificate`:

- the certificate must be in `us-east-1`, wherever the rest of your infrastructure lives
- the certificate must exist and be `ISSUED`
- every alternate domain name must be covered by the certificate's domain name or one of its subject
  alternative names, with a wildcard covering exactly one label

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
`AWS::CloudFront::Distribution` uses `AcmCertificateArn` and `SslSupportMethod`. A template or CDK
app works without changes.

A Distribution using `CloudFrontDefaultCertificate` needs no ACM certificate, and it goes
unchecked. A standalone `new SimCloudFront()` has no sim ACM to check against, and skips the check
as well.

## Disabling and deleting a Distribution

`DeleteDistributionCommand` removes a Distribution. CloudFront will only delete one that has stopped
serving. The sequence is `UpdateDistributionCommand` with `Enabled: false` first, then the deletion. Deleting an enabled Distribution answers `DistributionNotDisabled`, as it does in AWS.

`UpdateDistributionCommand` takes a whole `DistributionConfig`, and applies the update as a
replacement. Anything left out of the new config is dropped, including alternate domain names and
the default root object. Read the Distribution first, change the field you want, and send the config
back.

Once the Distribution is deleted, a request to its CloudFront domain or any of its alternate domain
names stops resolving to it, and those alternate domain names are free for another Distribution.

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
when the name matches nothing. A cache Behavior still pointing at a deleted Function runs no
Function code.

## Simulated CloudFront Functions

The sim CloudFront supports `viewer-request` and `viewer-response` CloudFront Functions.

A `viewer-response` Function runs for an Origin status below 400. CloudFront skips the
viewer-response event once the Origin has answered 400 or higher (see
[Limitations](#limitations)), and so does this simulation.

Use `makeCffFunctionCodeInput` to pass a JavaScript handler function to `CreateFunctionCommand`, or
[CloudFormation bindings](https://yulinsim.dev/services/cloudformation/#cloudfront-function-bindings "CloudFront Function bindings usage docs")
to back a template Resource with one. A handler reference is what to reach for first. It stops on a
breakpoint and can close over the test's own state. Publish the source itself where the test is
about the code the Distribution carries, down to the 10 KB it has to fit in. A
[Lambda@Edge](#simulated-lambdaedge) function is an ordinary simulated Lambda function, and the same
choice covers it.

The `host` header a function sees is the hostname the request was made to CloudFront with, being the
Distribution domain name or one of its alternate domain names. Requests served on localhost arrive
with a Yulin-local host such as `distro123.cloudfront.net.sim-aws.localhost:52341`, and the local
suffix and port are dropped before the function runs. A function building a URL from
`event.request.headers.host.value` behaves as it would on AWS. As on AWS, `host` is read-only, and a
host a function writes is discarded before the Origin sees it.

A header arriving more than once reaches the Function as one entry holding every value it arrived
with. `value` carries the first, and `multiValue` carries all of them, the same shape a repeated
query string parameter has. A response setting three cookies gives a viewer-response Function this:

```typescript
event.response.headers["set-cookie"];
// {
//   value: "session=abc123; Path=/",
//   multiValue: [
//     { value: "session=abc123; Path=/" },
//     { value: "state=; Max-Age=0" },
//     { value: "signed-in=1; Path=/" },
//   ],
// }
```

A Function returning that response untouched leaves all three cookies on their way to the viewer. A
Function writing `multiValue` sends one header per value in it, and CloudFront ignores `value` while
both are there. Writing `value` on its own sends a single header.

A Function reads the query string as the viewer spelled it. `?q=%E5%AE%B6` arrives as
`event.request.querystring.q.value === "%E5%AE%B6"`, `?q=a+b` keeps its plus, and a percent-encoded
parameter name stays encoded. Whatever a Function leaves in `querystring` goes on to the Origin as
it stands. A Function returning the request untouched forwards the query byte for byte, and one
writing a value of its own encodes it (the same job it has on AWS).

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

CloudFront Functions run JS2, ECMAScript 5.1 plus a named subset of ES 6 to 12. It refuses
constructs ordinary JavaScript allows. Yulin publishes ESLint and Oxlint configs that report those
refusals in the editor, ahead of publication. See
[Linting CloudFront Functions JS2](https://yulinsim.dev/lint/ "CloudFront Functions JS2 lint config usage docs").

CloudFront also caps Function code at 10 KB, counted on the source as uploaded, comments and all.
Simulated `CreateFunction` refuses anything larger with `FunctionSizeLimitExceeded`, as the real
service does. A test that deploys the Stack reports the overrun where the rest of the suite runs,
ahead of `cdk deploy`. A handler passed as a function reference carries no source to count, and the
limit leaves it alone.

### Reading a Function back

`ListFunctions` reports the Functions the Account holds. Each carries the `FunctionConfig` it was
created with and the `FunctionMetadata` CloudFront gave it. `DescribeFunction` reports one by name,
and `GetFunction` reports its code. A test that wants to know which Function a stack deployed, and
on which runtime, asks one of these.

```typescript sim-cloudfront-function-read
/**
 * Reading a deployed CloudFront Function back.
 */

import {
  CreateFunctionCommand,
  DescribeFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCloudFront = simAws.cloudFront();

await simCloudFront.createFunction(
  new CreateFunctionCommand({
    Name: "beacon",
    FunctionConfig: {
      Comment: "Answers the analytics beacon",
      Runtime: "cloudfront-js-2.0",
    },
    FunctionCode: Buffer.from(`
      function handler(event) {
        return { statusCode: 204, statusDescription: "No Content" };
      }
    `),
  }),
);

// CloudFront publishes a new Function in the background.
await simAws.backgroundTasksComplete();

const listed = await simCloudFront.listFunctions(new ListFunctionsCommand({}));

// cloudfront-js-2.0
console.log(listed.FunctionList.Items[0]?.FunctionConfig.Runtime);

const described = await simCloudFront.describeFunction(
  new DescribeFunctionCommand({ Name: "beacon", Stage: "LIVE" }),
);

// Answers the analytics beacon
console.log(described.FunctionSummary.FunctionConfig.Comment);

const got = await simCloudFront.getFunction(
  new GetFunctionCommand({ Name: "beacon" }),
);

// The source the Function was created with.
console.log(Buffer.from(got.FunctionCode).toString());
```

`Stage` picks the copy to read. A Function is created into `DEVELOPMENT` and reaches `LIVE` once
CloudFront has published it, and an omitted `Stage` means `DEVELOPMENT`, as it does on AWS. Asking
for the `LIVE` copy of a Function still waiting to publish fails with `NoSuchFunctionExists`, and so
does a name the Account holds no Function under.

`CreatedTime` and `LastModifiedTime` come off the simulated clock. Freezing time before the deploy
pins both to an instant the test picked (see
[Controlling simulated time](https://yulinsim.dev/time/ "Simulated time usage docs")).

A Function backed by a handler function reference was given no source to keep. `GetFunction` answers
with that handler's own source text. That is the code the Function runs.

The whole list comes back. `Marker` and `MaxItems` paging is left out, matching the paging left out
of the other simulated listings. `UpdateFunction`, `PublishFunction` and `TestFunction` are not
simulated.

### Calling a Function handler without a Distribution

A test of the handler on its own, with no Distribution in front of it, still has to pass it a whole
event. `cloudFrontViewerRequestEventFactory` and `cloudFrontViewerResponseEventFactory` make the
two, so such a test says what the request or the response was and leaves the rest alone:

```typescript sim-cloudfront-function-event-factory
/**
 * Making a CloudFront Functions event to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  cloudFrontViewerResponseEventFactory,
  type CloudFrontFunction,
} from "@kensio/yulin/cloudfront";

function securityHeadersHandler(
  event: CloudFrontFunction.ViewerResponseEvent,
): CloudFrontFunction.Response {
  const response = event.response;
  const contentType = response.headers["content-type"]?.value ?? "";

  if (contentType.startsWith("text/html")) {
    response.headers["x-frame-options"] = { value: "DENY" };
  }

  return response;
}

// A response carrying a page. Those are the ones the policy is about.
const documentResponseFactory = new VariantFactory(
  cloudFrontViewerResponseEventFactory,
  {
    response: {
      headers: { "content-type": { value: "text/html; charset=utf-8" } },
    },
  },
);

const page = securityHeadersHandler(documentResponseFactory.make());

// DENY
console.log(page.headers["x-frame-options"]?.value);

// One response, for a test about a single asset. Everything else about it, down
// to the request that asked for it, is filled in as a served response's is.
const asset = securityHeadersHandler(
  cloudFrontViewerResponseEventFactory.make({
    response: { headers: { "content-type": { value: "text/css" } } },
  }),
);

// undefined
console.log(asset.headers["x-frame-options"]?.value);
```

The defaults describe a request for `/cloudfront/` reaching the Distribution, with a `host` of
`yulin.test`, a session cookie and a viewer address. A viewer-response event carries the request
that asked for it as well as the response, and the response's own defaults are a status code and no
headers.

The [event factories page](https://yulinsim.dev/factories/ "Test factories for AWS event shapes usage docs")
covers what the factories have in common.

## Simulated Lambda@Edge

A cache Behavior can run a Lambda function at any of CloudFront's four events through
`LambdaFunctionAssociations`. Those are `viewer-request` and `viewer-response` at the edge, and
`origin-request` and `origin-response` either side of the Origin fetch. Where a CloudFront Function
is a small piece of JavaScript running in CloudFront's own runtime, a Lambda@Edge function is an
ordinary simulated Lambda function, with an execution role, an environment and whatever SDK calls
its handler makes.

Three things about Lambda@Edge catch people out on AWS, and simulated CloudFront refuses all three
the way AWS refuses them, when the Distribution is written rather than when a request arrives.

- **The function lives in `us-east-1`**, wherever the rest of the stack lives.
- **The association names a published version**, such as `:1`. An unqualified ARN, `$LATEST` and an
  alias are each refused.
- **The execution role trusts `edgelambda.amazonaws.com`** as well as `lambda.amazonaws.com`. A role
  set up for an ordinary function is the usual reason a first Lambda@Edge deploy fails.

```typescript sim-cloudfront-lambda-edge
/**
 * A Lambda@Edge function rewriting a request at the viewer.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import type { LambdaAtEdge } from "@kensio/yulin/cloudfront";

const simAws = new SimAws();

// A Lambda@Edge execution role trusts both service principals.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "EdgeRewriteRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: {
          Service: ["lambda.amazonaws.com", "edgelambda.amazonaws.com"],
        },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

// The function has to be in us-east-1, and the Behavior names a version.
const edgeLambda = simAws.region("us-east-1").lambda();

await edgeLambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rewrite-uri",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: LambdaAtEdge.RequestEvent) => {
        const { request } = event.Records[0].cf;

        // A header is a list keyed by its lowercase name, and a status is a
        // string. Both differ from the CloudFront Functions shapes.
        if (request.headers["x-preview"]?.[0]?.value === "1") {
          return {
            status: "302",
            headers: {
              location: [{ key: "Location", value: "/preview.html" }],
            },
          };
        }

        request.uri = "/index.html";

        return request;
      }),
    },
  }),
);

const version = await edgeLambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "rewrite-uri" }),
);

await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "edge-rewrite",
      Comment: "Rewriting at the viewer",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "site-origin",
            DomainName: "edge-site.s3.amazonaws.com",
            S3OriginConfig: { OriginAccessIdentity: "" },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
        LambdaFunctionAssociations: {
          Quantity: 1,
          Items: [
            {
              EventType: "viewer-request",
              LambdaFunctionARN: version.FunctionArn,
              IncludeBody: false,
            },
          ],
        },
      },
    },
  }),
);
```

A `viewer-request` handler returning the request carries on to the Origin with whatever it changed.
Returning a response answers the viewer there and then, and the Origin is never read. A
`viewer-response` handler returns the response the viewer gets.

Set `IncludeBody` to give a `viewer-request` or `origin-request` handler the request body, which
arrives base64 encoded under `request.body.data`. A handler setting `request.body.action` to
`replace` sends its own body to the Origin. The field belongs to the two request events, and an
association setting it on `viewer-response` or `origin-response` is refused, as CloudFront refuses
one.

A handler that throws answers the viewer with a 502, as CloudFront answers a failed edge function.
The error reaches the function's own output and nothing else.

### The origin events

An `origin-request` function runs after the Behavior has resolved the Origin and before the fetch.
Its event carries `request.origin`, holding the Origin the fetch is about to read, under `custom` or
`s3` for the kind it is. A handler rewriting `origin.custom.domainName` sends the fetch to another
Origin, and one rewriting `path` reads under another prefix. A header added to `customHeaders`
reaches the Origin and the viewer never sees it. A handler returning a response answers the viewer
with the Origin unread.

An `origin-response` function runs after the fetch and before the custom error page replaces an
error status. It runs on whatever the Origin answered, including a 400 and above. That is where the
origin events differ from the viewer events, and CloudFront documents it. Returning a response
replaces what the viewer gets.

At both origin events the `host` header holds the Origin's own domain name. A viewer event shows the
domain the viewer used.

```typescript sim-cloudfront-lambda-edge-origin
/**
 * A Lambda@Edge function choosing the Origin, and another one stamping what
 * that Origin answered.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import type { LambdaAtEdge } from "@kensio/yulin/cloudfront";

const simAws = new SimAws();

// A Lambda@Edge execution role trusts both service principals, at the origin
// events as at the viewer events.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "EdgeOriginRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: {
          Service: ["lambda.amazonaws.com", "edgelambda.amazonaws.com"],
        },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

const edgeLambda = simAws.region("us-east-1").lambda();

await edgeLambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "route-origin",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: LambdaAtEdge.OriginRequestEvent) => {
          const { request } = event.Records[0].cf;
          const { custom } = request.origin;

          if (custom === undefined) {
            return request;
          }

          // Everything under /api is served by the second Origin.
          if (request.uri.startsWith("/api/")) {
            custom.domainName = "orders.example.test";
          }

          // A header the viewer never sent and never sees.
          custom.customHeaders["x-from-cloudfront"] = [
            { key: "X-From-CloudFront", value: "yes" },
          ];

          return request;
        },
      ),
    },
  }),
);

const routeVersion = await edgeLambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "route-origin" }),
);

await edgeLambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "stamp-origin-response",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: LambdaAtEdge.OriginResponseEvent): LambdaAtEdge.Response => {
          const { response } = event.Records[0].cf;

          // This runs for an Origin error too, so the status is worth keeping.
          return {
            ...response,
            headers: {
              ...response.headers,
              "x-origin-status": [
                { key: "X-Origin-Status", value: response.status },
              ],
            },
          };
        },
      ),
    },
  }),
);

const stampVersion = await edgeLambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "stamp-origin-response" }),
);

const customOriginConfig = {
  HTTPPort: 80,
  HTTPSPort: 443,
  OriginProtocolPolicy: "https-only",
} as const;

await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "edge-origin-routing",
      Comment: "Choosing the Origin at the edge",
      Enabled: true,
      Origins: {
        Quantity: 2,
        Items: [
          {
            Id: "site-origin",
            DomainName: "site.example.test",
            CustomOriginConfig: customOriginConfig,
          },
          {
            Id: "orders-origin",
            DomainName: "orders.example.test",
            CustomOriginConfig: customOriginConfig,
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
        LambdaFunctionAssociations: {
          Quantity: 2,
          Items: [
            {
              EventType: "origin-request",
              LambdaFunctionARN: routeVersion.FunctionArn,
            },
            {
              EventType: "origin-response",
              LambdaFunctionARN: stampVersion.FunctionArn,
            },
          ],
        },
      },
    },
  }),
);
```

Two Origin rewrites are refused, and the viewer gets the 502 a failed edge function gets, carrying
the reason (see [Limitations](#limitations)). One switches an Origin between `custom` and `s3`. The
other moves an S3 Origin to another Bucket.

### Which edge function runs where

CloudFront takes one edge function per event type, and it does not combine CloudFront Functions with
Lambda@Edge at the viewer events. A Behavior with a viewer-request CloudFront Function and a
viewer-response Lambda@Edge function is refused, and so is a Behavior naming both at one event type.
Simulated CloudFront refuses the same combinations. The rule stops at the viewer. A viewer-request
CloudFront Function runs alongside a Lambda@Edge function on either origin event.

Neither kind runs at the viewer response once the Origin has answered 400 or higher. CloudFront
skips that event for an Origin error, and the status the Origin returned is what decides it (see
[Limitations](#limitations)).

Both kinds of function see the `host` header as the hostname the viewer reached CloudFront with,
rather than the Yulin-local host a request served on localhost arrives with. As on AWS, `host` is
read-only at the viewer request, and a host a handler writes is discarded before the Origin sees it.

### From CloudFormation

`AWS::CloudFront::Distribution` takes `LambdaFunctionAssociations` on `DefaultCacheBehavior` and on
any entry of `CacheBehaviors`. CloudFormation writes the list as a plain array where the SDK writes
the `Quantity` and `Items` pair. `Ref` on an `AWS::Lambda::Version` answers the qualified function
ARN. That is the value an association names, and the two fit together directly:

```yaml
EdgeVersion:
  Type: AWS::Lambda::Version
  Properties:
    FunctionName: !Ref RewriteFunction

SiteDistribution:
  Type: AWS::CloudFront::Distribution
  Properties:
    DistributionConfig:
      DefaultCacheBehavior:
        TargetOriginId: SiteOrigin
        ViewerProtocolPolicy: allow-all
        LambdaFunctionAssociations:
          - EventType: viewer-request
            LambdaFunctionARN: !Ref EdgeVersion
```

The function still has to live in us-east-1. A stack holding one is a us-east-1 stack.

An association naming a function version this simulation does not hold is left out of the deployed
Distribution and recorded on `stack.ignoredProperties`, under the event type it was on. A template
pointing at a function in a real account is the usual reason. The rest of the Behavior deploys, and
the event the skipped association was on is left empty. A test that cares reads the record.

Everything real CloudFront refuses still fails the deployment. A function outside us-east-1, an ARN
without a version qualifier, an execution role missing the `edgelambda.amazonaws.com` trust, an
`EventType` that is none of CloudFront's four, two functions on one event type and a viewer event
running both kinds of edge function each fail a real deploy of the same template.

CDK reaches a Behavior through `edgeLambdas`, given a `lambda.Version` from the same stack:

```typescript sim-cloudfront-lambda-edge-cdk
/**
 * A CDK Distribution running a Lambda@Edge function at the viewer request.
 */

import { Stack } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/**
 * Example CDK stack whose Distribution rewrites every request at the edge.
 *
 * The stack is in us-east-1, the one Region CloudFront runs a Lambda@Edge
 * function from.
 */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, { env: { region: "us-east-1" } });

    const siteBucket = new s3.Bucket(this, "SiteBucket");

    // A Lambda@Edge execution role trusts both service principals.
    const edgeRole = new iam.Role(this, "EdgeRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com"),
      ),
    });

    const rewriteFunction = new lambda.Function(this, "RewriteFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      role: edgeRole,
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  const { request } = event.Records[0].cf;
  request.uri = "/index.html";
  return request;
};
`),
    });

    new cloudfront.Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        edgeLambdas: [
          {
            // edgeLambdas takes a published version, and currentVersion
            // is one.
            functionVersion: rewriteFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }
}
```

`cloudfront.experimental.EdgeFunction` deploys from a us-east-1 stack, where the construct creates
the function alongside everything else.

From a stack in any other Region the construct writes the function, its published version and an SSM
parameter holding the version ARN into a support stack in us-east-1. The stack using the function
reads that parameter back through a `Custom::CrossRegionStringParameterReader` resource, and the
Behavior's `LambdaFunctionARN` is an `Fn::GetAtt` on it. Simulated CloudFormation makes that read
itself, against the Region the resource names, and the association ends up holding the ARN the
support stack published. Both stacks have to deploy, which is what deploying the whole cloud
assembly does:

```typescript
await simAws.cloudFormation().deployCdkOut("cdk.out");
```

Deploy the using stack's template on its own and no parameter has been written. The read finds
nothing and says so on `stack.ignoredProperties`, the Behavior deploys without the association, and
the site serves from the Origin (see [Limitations](#limitations)).

## Web ACLs

A Distribution can put a WAFv2 web ACL in front of everything it serves. Name the web ACL's ARN in
`WebACLId` and the Distribution evaluates it against every request that arrives. A request the web
ACL blocks gets 403 from the edge. A request it allows carries on to the cache Behavior and the
Origin.

CloudFront takes its web ACL this way. WAFv2's `AssociateWebACL` covers the regional resource types.

The web ACL has to be a `CLOUDFRONT` scope one, created in `us-east-1` (see
[scopes](https://yulinsim.dev/services/wafv2/#scopes)). A `WebACLId` naming a `REGIONAL` web ACL, or one this
simulation never created, is refused with `InvalidWebACLId` at `CreateDistribution` and at
`UpdateDistribution`.

The web ACL decides before any other stage sees the request. A blocked request never reaches a
viewer-request CloudFront Function, a cache Behavior, a response headers policy or the Origin.

A CloudFormation Distribution naming a web ACL this simulation does not hold deploys without one.
The `WebACLId` lands on `stack.ignoredProperties` and every request is served, including the ones
the web ACL would have decided. A template naming a web ACL from a real account is ordinary, and a
site that failed to deploy over its firewall would cost a local dev server and a test suite every
request they make. `CreateDistribution` still refuses the same `WebACLId`, as real CloudFront
refuses it.

```typescript sim-cloudfront-web-acl
/**
 * Blocking a request to a Distribution with a web ACL.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();
  await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));
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
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "admin/users.html",
      ContentType: "text/html",
      Body: "<h1>Users</h1>",
    }),
  );

  // A CLOUDFRONT scope web ACL lives in us-east-1, wherever the Distribution
  // was created from.
  const acl = await simAws
    .accountRegionScope(simAws.defaultAccountId, "us-east-1")
    .wafV2()
    .createWebAcl(
      new CreateWebACLCommand({
        Name: "site-acl",
        Scope: "CLOUDFRONT",
        DefaultAction: { Allow: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: false,
          CloudWatchMetricsEnabled: false,
          MetricName: "site",
        },
        Rules: [
          {
            Name: "block-admin",
            Priority: 0,
            Action: { Block: {} },
            Statement: {
              ByteMatchStatement: {
                FieldToMatch: { UriPath: {} },
                PositionalConstraint: "STARTS_WITH",
                SearchString: Buffer.from("/admin"),
                TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
              },
            },
            VisibilityConfig: {
              SampledRequestsEnabled: false,
              CloudWatchMetricsEnabled: false,
              MetricName: "block-admin",
            },
          },
        ],
      }),
    );

  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "guarded-site",
        Comment: "Site behind a web ACL",
        Enabled: true,
        WebACLId: acl.Summary!.ARN,
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

  const distroHostname = creation.Distribution!.DomainName!;

  const blocked = await fetch(
    srv.localUrl(`http://${distroHostname}/admin/users.html`),
  );
  console.log(blocked.status); // 403

  // The Bucket still holds the page. The request never got as far as the
  // Origin to ask for it.
} finally {
  await srv.close();
}
```

See [simulated WAFv2](https://yulinsim.dev/services/wafv2/) for what a rule can inspect and how a blocked request is
answered.

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

  const domainName = stack.output("DistributionDomainName");
  const response = await fetch(srv.localUrl(`http://${domainName}/`));

  console.log(response.headers.get("cache-control"));
} finally {
  await srv.close();
}
```

Each header in `CustomHeadersConfig` carries an `Override` boolean. With it set, the policy's value
replaces one the Origin sent. Without it, the Origin's value is kept and the policy's is dropped. A
header the Origin left out is added either way.

`RemoveHeadersConfig` takes headers away, and is applied before the added ones. A header named in
both sections ends up present with the policy's value.

The policy is applied after a custom error response is fetched and before the viewer-response event,
as CloudFront does. An error page carries the policy's headers. A viewer-response Function sees them
in `event.response.headers` and can change them, where the Origin answered below 400 and the
Function ran at all.

`SecurityHeadersConfig` is what CDK's `ResponseHeadersPolicy` construct synthesizes from
`securityHeadersBehavior`, and every one of its sections is modelled. `ContentSecurityPolicy`,
`ContentTypeOptions`, `FrameOptions`, `ReferrerPolicy`, `StrictTransportSecurity` and `XSSProtection`
each become the header CloudFront documents for it, honouring the section's own `Override` the same
way a `CustomHeadersConfig` item does.

`ServerTimingHeadersConfig` adds a `Server-Timing` header once `Enabled` is true. `SamplingRate` is
ignored. This simulation adds the header to every response. A test asserting on it never depends on
chance, and the header's value is a fixed placeholder in place of real Origin timing.

`CorsConfig` is what CDK's `corsBehavior` synthesizes. CloudFront reflects the viewer request's
`Origin` header against `AccessControlAllowOrigins`, in place of sending the list itself. A request
naming an Origin the list allows gets the CORS headers the section configures, with the response
varying on `Origin` unless the list contains `*`. A request naming one the list omits gets none of
them, matching CloudFront, which sends none in preference to a mismatched one.
`AccessControlAllowMethods` of `["ALL"]` expands to CloudFront's full method list, and
`AccessControlAllowCredentials: false` leaves `Access-Control-Allow-Credentials` off entirely, since
a header naming `false` means the same as its absence to a browser.

`AccessControlAllowMethods`, `AccessControlAllowHeaders` and `AccessControlMaxAgeSec` answer what a
preflight asks, and their headers go on a response to an `OPTIONS` request alone. Every other method
is answered without them, as CloudFront answers it. `Access-Control-Allow-Origin`,
`Access-Control-Allow-Credentials` and `Access-Control-Expose-Headers` come back either way, and so
does the `Vary: Origin` a reflected Origin carries. A list left empty sends no header at all, which
is how `SimpleCORS` answers with the Origin header by itself.

An allow-list entry may use the wildcard on its own, meaning every Origin, or as the leftmost
subdomain, so `*.example.org` matches `https://site.example.org`. It stands for exactly one label, as
a wildcard certificate does, and it leaves `https://deep.site.example.org` unmatched. An entry naming
no scheme matches the host whichever scheme the request used. CloudFront allows the wildcard nowhere
else, and an entry placing one elsewhere (`example.*`, `test.*.example.org`, `*test.example.org`,
`exa*mple.org`) fails the stack.

`OriginOverride` decides the whole CORS section at once, where the `Override` on a custom or security
header decides one header. Without it, an Origin response carrying any CORS header at all, named by
the policy or otherwise, keeps every header the section would have set off the response.

### Managed policies

CloudFront's five managed policies are here from the start, under the IDs AWS publishes, and a
Behavior names one without a template creating anything. `SecurityHeadersPolicy`
(`67f7725c-6f97-4210-82d7-5512b31e9d03`), `SimpleCORS` (`60669652-455b-4ae9-85a4-c4c02393f86c`),
`CORS-With-Preflight` (`5cc3b908-e619-4b99-88e5-2cf7f45965bd`), `CORS-and-SecurityHeadersPolicy`
(`e61eb60c-9c35-4d20-a928-2b84e02af89c`) and `CORS-with-preflight-and-SecurityHeadersPolicy`
(`eaab4381-ed33-4a86-88ca-d9558dc6cd63`) each carry the sections
[AWS documents](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html)
for it. CDK's `ResponseHeadersPolicy.SECURITY_HEADERS` and its four siblings synthesize those IDs, so
a stack reaching for one deploys and serves the headers.

The managed policies sit in CloudFront's own namespace. A template may create a policy called
`SecurityHeadersPolicy` of its own, and deleting that stack leaves the managed one where it was.

A CloudFormation Distribution whose Behavior names a policy that is neither managed nor created here
deploys without one. The `ResponseHeadersPolicyId` lands on `stack.ignoredProperties` under that
Behavior, and the Behavior serves every response without the headers the policy would have set. A
template naming a policy from a real account, or one another stack created, is ordinary, and a site
that failed to deploy over a set of headers would cost a local dev server and a test suite every
request they make. One Behavior losing its policy leaves the others holding theirs, and a path
Behavior is recorded under its `PathPattern`, the way a skipped Lambda@Edge association is.

`CreateDistribution` and `UpdateDistribution` still refuse the same ID, as real CloudFront refuses
it.

## Cache policies

A cache policy decides what a cache Behavior keys its cache on and how long an object stays there.
Declare one as `AWS::CloudFront::CachePolicy` and point a Behavior's `CachePolicyId` at it with a
`Ref`, which is what CDK's `CachePolicy` construct synthesizes.

```typescript sim-cloudfront-cache-policy
/**
 * Reading back the cache policy a Behavior was given.
 */

import { GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      BeaconPolicy: {
        Type: "AWS::CloudFront::CachePolicy",
        Properties: {
          CachePolicyConfig: {
            Name: "BeaconPolicy",
            MinTTL: 0,
            DefaultTTL: 60,
            MaxTTL: 3600,
            ParametersInCacheKeyAndForwardedToOrigin: {
              EnableAcceptEncodingGzip: true,
              CookiesConfig: { CookieBehavior: "none" },
              HeadersConfig: { HeaderBehavior: "none" },
              QueryStringsConfig: {
                QueryStringBehavior: "whitelist",
                QueryStrings: ["page"],
              },
            },
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "BeaconPolicy"],
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
              // CachingOptimized, one of CloudFront's managed policies.
              CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
            },
            CacheBehaviors: [
              {
                PathPattern: "/beacon",
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                CachePolicyId: { Ref: "BeaconPolicy" },
              },
            ],
          },
        },
      },
    },
    Outputs: {
      DistributionId: { Value: { Ref: "SiteDistribution" } },
      BeaconPolicyId: { Value: { Ref: "BeaconPolicy" } },
    },
  },
});

await stack.waitForDeployComplete();

const read = await simAws
  .cloudFront()
  .getDistribution(
    new GetDistributionCommand({ Id: stack.output("DistributionId") }),
  );
const config = read.Distribution?.DistributionConfig;

// The managed ID the default Behavior was given.
console.log(config?.DefaultCacheBehavior?.CachePolicyId);

// The ID of the policy the template created, which the path Behavior Refs.
console.log(
  config?.CacheBehaviors?.Items?.[0]?.CachePolicyId ===
    stack.output("BeaconPolicyId"),
);

// The policy itself, holding the TTLs and the cache key the template gave it.
const beaconPolicy = simAws
  .cloudFront()
  .getCachePolicyById(stack.output("BeaconPolicyId"));

console.log(beaconPolicy?.defaultTtlSec); // 60
console.log(beaconPolicy?.cacheKey.queryStringBehavior); // "whitelist"
console.log(beaconPolicy?.cacheKey.queryStrings); // ["page"]
```

A Behavior records the ID it was given, and `GetDistribution` reports it back for both the default
Behavior and a named one. An update changing the policy is reported the same way.

The policy itself carries everything `CachePolicyConfig` holds. `getCachePolicyById` hands back the
three TTLs, the three sections of `ParametersInCacheKeyAndForwardedToOrigin` and the two
`EnableAcceptEncoding` flags. A test can assert that its Behavior leaves the query string out of the
cache key before sim CloudFront has a cache to key.

Nothing acts on any of it. Sim CloudFront holds no edge cache, and every request reaches the Origin
whatever the policy would have cached on real CloudFront.

A TTL the template left out falls back to CloudFront's own default (0 seconds for `MinTTL`, one day
for `DefaultTTL` and 365 days for `MaxTTL`), and a `MinTTL` above a day raises the `DefaultTTL` with
it the way CloudFront does. An absent cache key section falls back to `none`. A section naming a
behaviour CloudFront does not offer fails the Stack, naming the Resource. `HeaderBehavior` takes
`none` and `whitelist` alone, where CloudFront gives an origin request policy a wider set.

A policy name is unique within an account, as it is in CloudFront. A second
`AWS::CloudFront::CachePolicy` claiming a name is refused with `CachePolicyAlreadyExists`.

### Managed cache policies

CloudFront's seven managed policies are here from the start, under the IDs AWS publishes, and a
Behavior names one without a template creating anything. `CachingOptimized`
(`658327ea-f89d-4fab-a63d-7e88639e58f6`), `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`),
`CachingOptimizedForUncompressedObjects` (`b2884449-e4de-46a7-ac36-70bc7f1ddd6d`), `Amplify`
(`2e54312d-136d-493c-8eb9-b001f22f67d2`), `Elemental-MediaPackage`
(`08627262-05a9-4f76-9ded-b50ca2e3a84f`), `UseOriginCacheControlHeaders`
(`83da9c7e-98b4-4e11-a168-04f0df8e2c65`) and `UseOriginCacheControlHeaders-QueryStrings`
(`4cc15a8a-d715-48a4-82b8-cc0b614638fe`) are each held under the name
[AWS publishes](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)
for it. CDK's `CachePolicy.CACHING_OPTIMIZED` and its six siblings synthesize those IDs. A stack
reaching for one deploys.

Each also carries the TTLs and the cache key AWS publishes for it. A Behavior on `CachingOptimized`
here holds the same 1 second floor, the same day of default TTL and the same empty cache key as one
in an account.

The managed policies sit in CloudFront's own namespace. A template may create a policy called
`CachingDisabled` of its own, and deleting that stack leaves the managed one where it was.

A CloudFormation Distribution whose Behavior names a policy that is neither managed nor created here
deploys without one. The `CachePolicyId` lands on `stack.ignoredProperties` under that Behavior, the
way an absent response headers policy does, and the Behavior reports no policy.

`CreateDistribution` and `UpdateDistribution` still refuse the same ID with `NoSuchCachePolicy`, as
real CloudFront refuses it.

## Origin request policies

An origin request policy decides which of the viewer's headers, cookies and query strings a cache
Behavior carries to its Origin. Declare one as `AWS::CloudFront::OriginRequestPolicy` and point a
Behavior's `OriginRequestPolicyId` at it with a `Ref`, which is what CDK's `OriginRequestPolicy`
construct synthesizes.

```typescript sim-cloudfront-origin-request-policy
/**
 * Reading back the origin request policy a Behavior was given.
 */

import { GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      BeaconPolicy: {
        Type: "AWS::CloudFront::OriginRequestPolicy",
        Properties: {
          OriginRequestPolicyConfig: {
            Name: "BeaconPolicy",
            CookiesConfig: { CookieBehavior: "none" },
            HeadersConfig: { HeaderBehavior: "none" },
            QueryStringsConfig: { QueryStringBehavior: "all" },
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "BeaconPolicy"],
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
              // CORS-S3Origin, one of CloudFront's managed policies.
              OriginRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",
            },
            CacheBehaviors: [
              {
                PathPattern: "/beacon",
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                OriginRequestPolicyId: { Ref: "BeaconPolicy" },
              },
            ],
          },
        },
      },
    },
    Outputs: {
      DistributionId: { Value: { Ref: "SiteDistribution" } },
      BeaconPolicyId: { Value: { Ref: "BeaconPolicy" } },
    },
  },
});

await stack.waitForDeployComplete();

const read = await simAws
  .cloudFront()
  .getDistribution(
    new GetDistributionCommand({ Id: stack.output("DistributionId") }),
  );
const config = read.Distribution?.DistributionConfig;

// The managed ID the default Behavior was given.
console.log(config?.DefaultCacheBehavior?.OriginRequestPolicyId);

// The ID of the policy the template created, which the path Behavior Refs.
console.log(
  config?.CacheBehaviors?.Items?.[0]?.OriginRequestPolicyId ===
    stack.output("BeaconPolicyId"),
);
```

A Behavior records the ID it was given, and `GetDistribution` reports it back for both the default
Behavior and a named one. An update changing the policy is reported the same way.

Nothing here reads the policy itself. Sim CloudFront forwards the viewer's headers, cookies and
query string to the Origin whole, whatever the policy would have narrowed them to on real
CloudFront.

A policy name is unique within an account, as it is in CloudFront. A second
`AWS::CloudFront::OriginRequestPolicy` claiming a name is refused with
`OriginRequestPolicyAlreadyExists`. `Name` and `Comment` are the parts of
`OriginRequestPolicyConfig` the policy carries.

### Managed origin request policies

CloudFront's eight managed policies are here from the start, under the IDs AWS publishes, and a
Behavior names one without a template creating anything. `AllViewer`
(`216adef6-5c7f-47e4-b989-5492eafa07d3`), `AllViewerAndCloudFrontHeaders-2022-06`
(`33f36d7e-f396-46d9-90e0-52428a34d9dc`), `AllViewerExceptHostHeader`
(`b689b0a8-53d0-40ab-baf2-68738e2966ac`), `CORS-CustomOrigin`
(`59781a5b-3903-41f3-afcb-af62929ccde1`), `CORS-S3Origin` (`88a5eaf4-2fd4-4709-b370-b4c650ea3fcf`),
`Elemental-MediaTailor-PersonalizedManifests` (`775133bc-15f2-49f9-abea-afb2e0bf67d2`),
`HostHeaderOnly` (`bf0718e1-ba1e-49d1-88b1-f726733018ae`) and `UserAgentRefererHeaders`
(`acba4595-bd28-49b8-b9fe-13317c0390fa`) are each held under the name
[AWS publishes](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)
for it. CDK's `OriginRequestPolicy.ALL_VIEWER` and its seven siblings synthesize those IDs. A stack
reaching for one deploys.

The managed policies sit in CloudFront's own namespace. A template may create a policy called
`AllViewer` of its own, and deleting that stack leaves the managed one where it was.

A CloudFormation Distribution whose Behavior names a policy that is neither managed nor created here
deploys without one. The `OriginRequestPolicyId` lands on `stack.ignoredProperties` under that
Behavior, the way an absent cache policy does, and the Behavior reports no policy.

`CreateDistribution` and `UpdateDistribution` still refuse the same ID with
`NoSuchOriginRequestPolicy`, as real CloudFront refuses it.

## Origin access controls

An origin access control is how a Distribution authenticates to a private Origin. The Origin then
admits the Distribution and nothing else. Declare one as `AWS::CloudFront::OriginAccessControl` and
point an Origin's `OriginAccessControlId` at it with a `Ref`, which is what CDK's
`S3BucketOrigin.withOriginAccessControl` synthesizes.

An `OriginAccessControlOriginType` of `s3` signs for an S3 Bucket Origin, and one of `lambda` signs
for a Lambda Function URL Origin. The origin type has to match the Origin it is attached to. An `s3`
origin access control on a custom Origin, or a `lambda` one on an S3 Origin, fails the Stack when
the Distribution is created, as CloudFront refuses it.

An S3 Origin whose origin access control signs reads its Bucket as the `cloudfront.amazonaws.com`
service principal, carrying the Distribution's ARN as `aws:SourceArn`. The Bucket policy is then the
whole decision. The Bucket needs a statement granting `s3:GetObject` to that principal, conditioned
on the Distribution allowed to read it. That is the policy CDK writes. A condition naming a different
Distribution, or an Origin that was never given an origin access control, answers 403.

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

  const siteHostname = stack.output("SiteHostname");
  const home = await fetch(srv.localUrl(`http://${siteHostname}/`));

  console.log(await home.text()); // <h1>Home</h1>
} finally {
  await srv.close();
}
```

The Bucket policy names the Distribution's ARN, and is created after the Distribution. The `Ref`
inside `Fn::Join` is the dependency CloudFormation orders the Stack by. The read is settled per
request, because the policy deciding it comes into existence after the Distribution does. The Origin
works out who it is reading as each time.

### A Lambda Function URL Origin

Putting a Function URL with `AuthType: AWS_IAM` behind a Distribution takes the origin access
control with `OriginAccessControlOriginType: lambda`, a custom Origin naming it whose `DomainName`
is the Function URL's hostname, and two `AWS::Lambda::Permission` Resources granting
`cloudfront.amazonaws.com` for that Distribution. It is the only way to serve a Function URL through
CloudFront without leaving the Function URL open to anyone who finds its endpoint.

Both permissions are needed. One grants `lambda:InvokeFunctionUrl` and the other
`lambda:InvokeFunction`, to the same principal with the same `SourceArn`, as
[Restrict access to an AWS Lambda function URL origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
sets out. CDK's `FunctionUrlOrigin.withOriginAccessControl` writes only the first. A CDK app has to
add the second itself:

```typescript
greeterFunction.addPermission("InvokeFunctionFromCloudFront", {
  principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
  action: "lambda:InvokeFunction",
  sourceArn: cdk.Fn.join("", [
    "arn:",
    cdk.Aws.PARTITION,
    ":cloudfront::",
    cdk.Aws.ACCOUNT_ID,
    ":distribution/",
    distribution.distributionId,
  ]),
});
```

The Origin request is made as the `cloudfront.amazonaws.com` service principal carrying the
Distribution's ARN, the same pair an S3 Origin read carries, and the function's resource policy is
the whole decision. A Stack missing either permission, or with one naming a different Distribution,
deploys and then answers 403 through the Distribution, as the real deployment does. The function is
never invoked, and writes no logs to look at either.

```typescript sim-cloudfront-function-url-origin-access-control
/**
 * Serving a private Lambda Function URL through an origin access control.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "greeter-stack",
    template: {
      Resources: {
        GreeterFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: "greeter",
            Role: "arn:aws:iam::888888888888:role/GreeterRole",
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            Code: {
              ZipFile:
                "exports.handler = async () => " +
                "({ statusCode: 200, body: 'Hello from behind CloudFront' });",
            },
          },
        },
        GreeterUrl: {
          Type: "AWS::Lambda::Url",
          Properties: {
            TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
            AuthType: "AWS_IAM",
          },
        },
        GreeterOac: {
          Type: "AWS::CloudFront::OriginAccessControl",
          Properties: {
            OriginAccessControlConfig: {
              Name: "greeter-oac",
              OriginAccessControlOriginType: "lambda",
              SigningBehavior: "always",
              SigningProtocol: "sigv4",
            },
          },
        },
        GreeterDistribution: {
          Type: "AWS::CloudFront::Distribution",
          Properties: {
            DistributionConfig: {
              Enabled: true,
              Origins: [
                {
                  Id: "GreeterOrigin",
                  // An Origin takes a domain name, and the Function URL
                  // attribute is a URL, so the host comes out of it.
                  DomainName: {
                    "Fn::Select": [
                      2,
                      {
                        "Fn::Split": [
                          "/",
                          { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
                        ],
                      },
                    ],
                  },
                  CustomOriginConfig: { OriginProtocolPolicy: "https-only" },
                  OriginAccessControlId: { Ref: "GreeterOac" },
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "GreeterOrigin",
                ViewerProtocolPolicy: "allow-all",
              },
            },
          },
        },
        // Nothing but this Distribution may invoke the Function URL, which is
        // what the condition on the Distribution's ARN says. Reaching the URL
        // takes both actions, so leaving either one out is a 403.
        InvokeFunctionUrlFromCloudFront: {
          Type: "AWS::Lambda::Permission",
          Properties: {
            FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
            Action: "lambda:InvokeFunctionUrl",
            Principal: "cloudfront.amazonaws.com",
            SourceArn: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:cloudfront::",
                  { Ref: "AWS::AccountId" },
                  ":distribution/",
                  { Ref: "GreeterDistribution" },
                ],
              ],
            },
          },
        },
        InvokeFunctionFromCloudFront: {
          Type: "AWS::Lambda::Permission",
          Properties: {
            FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
            Action: "lambda:InvokeFunction",
            Principal: "cloudfront.amazonaws.com",
            SourceArn: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:cloudfront::",
                  { Ref: "AWS::AccountId" },
                  ":distribution/",
                  { Ref: "GreeterDistribution" },
                ],
              ],
            },
          },
        },
      },
      Outputs: {
        SiteHostname: {
          Value: { "Fn::GetAtt": ["GreeterDistribution", "DomainName"] },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  const siteHostname = stack.output("SiteHostname");
  const greeting = await fetch(srv.localUrl(`http://${siteHostname}/greeting`));

  console.log(await greeting.text()); // Hello from behind CloudFront
} finally {
  await srv.close();
}
```

The Function URL is reachable directly as well, on its own endpoint, and it refuses a request that
arrives there without the permission the Distribution has. That is the point of the auth type. The
endpoint exists, and only the Distribution may use it.

`SigningBehavior` takes any of `always`, `never` and `no-override`. `always` and `no-override` both
sign, since nothing here sends a pre-signed viewer request to an Origin for `no-override` to pass
through. `never` turns the origin access control off while leaving it in place, and the Origin is
reached anonymously, as an Origin with no origin access control is. An S3 Origin then needs a Bucket
policy allowing that, and an `AWS_IAM` Function URL refuses the request outright.

`Ref` and `Fn::GetAtt` on `Id` both return the ID, so either resolves an Origin's
`OriginAccessControlId`. An Origin naming an ID no origin access control holds is refused with
`InvalidOriginAccessControl` when the Distribution is created. Tearing the Stack down removes the
origin access control, and its name is free again.

`OriginAccessControlOriginType` must be `s3` or `lambda`, and `SigningProtocol` must be `sigv4`. Any
other value fails the Stack by name.

A CloudFormation template is the only way to make one. There is no `CreateOriginAccessControl`
command here.

#### Posting to a Function URL Origin

A POST or PUT through an origin access control has to carry the SHA-256 of its body in an
`x-amz-content-sha256` header. CloudFront streams the viewer's body on to the Origin without
buffering it, and has no hash of its own to sign with. It signs the hash the viewer declared, and
`UNSIGNED-PAYLOAD` where the viewer declared none. Lambda supports no unsigned payload, and answers
`403` with `The request signature we calculated does not match the signature you provided`. The
handler never runs. The declared hash is checked against the body that arrived, and a digest of
other bytes is refused the same way.

A viewer computes the digest of what it is about to send, the way any SigV4 client does:

```typescript
const body = JSON.stringify({ email: "someone@example.com" });
const response = await fetch(`http://${siteHostname}/sign-in`, {
  method: "POST",
  body,
  headers: {
    "content-type": "application/json",
    "x-amz-content-sha256": createHash("sha256").update(body).digest("hex"),
  },
});
```

A GET or a HEAD is left alone. SigV4 hashes an empty payload for a request without a body, and
CloudFront can sign one of those on its own. An origin access control with a `SigningBehavior` of
`never` signs no Origin request, and states no payload hash for one. A POST through one reaches
the Origin anonymously, as it did before.

AWS documents the requirement on
[Restrict access to an AWS Lambda function URL origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html).
A simulated Distribution refuses the request for the same reason a real one does. A form post
missing the header fails in a test as well as on the deployment.

## Key value stores

A key value store holds data a CloudFront Function reads at request time. A redirect table or a
feature flag can live there instead of being baked into the Function's code.

AWS splits this across two SDK clients, and so does the simulator. The CloudFront client owns the
store, through `CreateKeyValueStoreCommand`, `DescribeKeyValueStoreCommand`,
`ListKeyValueStoresCommand`, `UpdateKeyValueStoreCommand` and `DeleteKeyValueStoreCommand`, all
addressing a store by name. The key value store client owns the data, through `GetKeyCommand`,
`PutKeyCommand`, `DeleteKeyCommand`, `ListKeysCommand`, `UpdateKeysCommand` and its own
`DescribeKeyValueStoreCommand`, all addressing a store by ARN.

Both clients are intercepted by `SimSdk`. Used directly, they are `simAws.cloudFront().keyValueStores()`
and `simAws.cloudFrontKeyValueStore()`.

```typescript sim-cloudfront-key-value-store
/**
 * Creating a CloudFront key value store and writing keys to it.
 */

import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The CloudFront client owns the store itself.
const created = await simAws
  .cloudFront()
  .keyValueStores()
  .createKeyValueStore(
    new CreateKeyValueStoreCommand({
      Name: "redirects",
      Comment: "Where old paths go",
    }),
  );

const kvsArn = created.KeyValueStore.ARN;
const data = simAws.cloudFrontKeyValueStore();

// The key value store client owns the data, and addresses the store by ARN.
// Every write carries an ETag, and it is this API's own: the one the
// CloudFront client returned above versions the resource, not the keys.
const described = await data.describeKeyValueStore(
  new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
);

const written = await data.updateKeys(
  new UpdateKeysCommand({
    KvsARN: kvsArn,
    IfMatch: described.ETag,
    Puts: [
      { Key: "/old-page", Value: "/new-page" },
      { Key: "/legacy", Value: "/current" },
    ],
  }),
);

console.log(written.ItemCount); // 2

const read = await data.getKey(
  new GetKeyCommand({ KvsARN: kvsArn, Key: "/old-page" }),
);

console.log(read.Value); // /new-page
```

A new store is `PROVISIONING` when the command returns and becomes `READY` in the background, as in
CloudFront. `await simAws.backgroundTasksComplete()` waits for that.

### ETags

The key value store commands do check `IfMatch`, where the Distribution and Function commands ignore
it. Both APIs require it on every write and CloudFront refuses a stale one, which is what stops two
writers overwriting each other. A write carrying a stale ETag is refused with `PreconditionFailed`,
and a caller has to thread the ETag through the way it does against CloudFront. Each write returns
the new ETag for the next one.

A store has two ETags and they are not interchangeable, as in AWS. Each `DescribeKeyValueStore`
returns its own. The CloudFront client's versions the store's configuration, and the key value store
client's versions the keys. Writing a key leaves the configuration's ETag where it was, and changing
the comment leaves the keys' where it was. A write carrying the other API's ETag is refused, and the
message says which of the two it wanted.

### Reading a store from a CloudFront Function

A Function reads its store through `cf`, which it gets from `import cf from "cloudfront"`. That is
the one import JS 2.0 has. `cf.kvs()` opens the store the Function is associated with, and its
`get`, `exists` and `meta` are all promises. A Function that reads a store is async.

A Function names the store it may read with `KeyValueStoreAssociations` on its `FunctionConfig`.
CloudFront takes at most one, and only on `cloudfront-js-2.0`. An association on the 1.0 runtime is
refused, because that runtime has no `cf` to reach a store through.

```typescript sim-cloudfront-function-key-value-store
/**
 * Reading a key value store from a CloudFront Function.
 */

import {
  CreateFunctionCommand,
  CreateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws
  .cloudFront()
  .keyValueStores()
  .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: "redirects" }));

const kvsArn = created.KeyValueStore.ARN;
const data = simAws.cloudFrontKeyValueStore();

const described = await data.describeKeyValueStore(
  new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
);

await data.putKey(
  new PutKeyCommand({
    KvsARN: kvsArn,
    Key: "/old-page",
    Value: "/new-page",
    IfMatch: described.ETag,
  }),
);

// The Function names the store it may read. It gets `cf` from the one import
// JS 2.0 has, and the read is awaited, so the handler is async.
await simAws.cloudFront().createFunction(
  new CreateFunctionCommand({
    Name: "redirect-cff",
    FunctionConfig: {
      Comment: "Redirects from a key value store",
      Runtime: "cloudfront-js-2.0",
      KeyValueStoreAssociations: {
        Quantity: 1,
        Items: [{ KeyValueStoreARN: kvsArn }],
      },
    },
    FunctionCode: Buffer.from(`
      import cf from "cloudfront";

      async function handler(event) {
        const request = event.request;

        if (await cf.kvs().exists(request.uri)) {
          const target = await cf.kvs().get(request.uri);

          return {
            statusCode: 302,
            statusDescription: "Found",
            headers: { location: { value: target } },
          };
        }

        return request;
      }
    `),
  }),
);

const cff = simAws.cloudFront().getCloudFrontFunctionByName("redirect-cff");

const redirected = await cff!.handleViewerRequest(
  new Request("https://cdn.test/old-page"),
);

console.log((redirected as Response).status); // 302
console.log((redirected as Response).headers.get("location")); // /new-page
```

`get` reads a string by default, and takes `{ format: "json" }` to parse the stored string or
`{ format: "bytes" }` for its UTF-8 bytes. A missing key rejects. A Function that wants a default checks
`exists` first, as the example does.

A Function written as a function reference has no import to write, and reads `cf` as a global.
Importing `@kensio/yulin/cloudfront/globals` gives that global a type, along with the CloudFront
Function event types. Each invocation gets its own `cf` through Node.js asynchronous context, and two
Functions associated with different stores read their own even when they run at the same time.

### From CloudFormation

`AWS::CloudFront::KeyValueStore` creates a store, and a Function associates one with
`FunctionConfig.KeyValueStoreAssociations`. CloudFormation takes a plain array there, where the SDK
takes a `Quantity` and `Items` pair. `Ref` on a key value store is its ARN, and the two fit together
directly:

```yaml
Redirects:
  Type: AWS::CloudFront::KeyValueStore
  Properties:
    Name: redirects

RedirectFunction:
  Type: AWS::CloudFront::Function
  Properties:
    Name: redirect-cff
    AutoPublish: true
    FunctionCode: !Sub "..."
    FunctionConfig:
      Comment: Redirects from a key value store
      Runtime: cloudfront-js-2.0
      KeyValueStoreAssociations:
        - KeyValueStoreARN: !Ref Redirects
```

`Fn::GetAtt` supports `Arn`, `Id` and `Status`. Deleting the Stack deletes the store, after the
Functions holding it have gone.

CDK's `cloudfront.KeyValueStore` and the `keyValueStore` prop on `cloudfront.Function` both deploy.
A CDK stack needs no hand-editing.

`cf.kvs()` refuses when the Function is associated with no store, and refuses an ID belonging to some
other store. Handing back an empty store would let a Function that lost its association run to
completion and quietly take every default.

## Available functionality

Sim CloudFront currently supports:

- `CreateDistributionCommand`, `GetDistributionCommand`, `UpdateDistributionCommand` and
  `DeleteDistributionCommand`
- `CreateFunctionCommand`, `ListFunctionsCommand`, `DescribeFunctionCommand`, `GetFunctionCommand`
  and `DeleteFunctionCommand`
- Refusing Function code over CloudFront's 10 KB size limit, with `FunctionSizeLimitExceeded`
- Key value stores, through both the CloudFront client and the key value store data client
- S3 Origins backed by sim S3 Buckets, reading them as the Bucket policy allows
- Custom Origins reaching sim HTTP APIs and sim Lambda Function URLs in process
- `CustomHeaders` and `OriginCustomHeaders` on an Origin, for an origin that admits only CloudFront
- CloudFront Distribution hostnames such as `distro123.cloudfront.net`
- Default cache Behavior and path-based cache Behaviors
- `DefaultRootObject` and `CustomErrorResponses`, for static sites and single-page apps
- `viewer-request` and `viewer-response` CloudFront Functions, including async ones
- Lambda@Edge functions at all four events, through `LambdaFunctionAssociations`
- `LambdaFunctionAssociations` on a template's Distribution, and CDK's `edgeLambdas`
- CloudFront Functions reading an associated key value store through `cf.kvs()`
- `AWS::CloudFront::ResponseHeadersPolicy`, for headers a cache Behavior sets on every response
- `AWS::CloudFront::CachePolicy`, and a Behavior's `CachePolicyId` read back through `GetDistribution`
- `AWS::CloudFront::OriginRequestPolicy`, and a Behavior's `OriginRequestPolicyId` read back the
  same way
- `AWS::CloudFront::KeyValueStore`, and `KeyValueStoreAssociations` on `AWS::CloudFront::Function`
- `AWS::CloudFront::OriginAccessControl`, letting an Origin read a private Bucket as CloudFront
- Viewer certificates from sim ACM, including CloudFront's `us-east-1` requirement
- `WebACLId`, putting a simulated WAFv2 web ACL in front of everything a Distribution serves
- Serving simulated CloudFront traffic on localhost with `serveSimAws`

The simulator focuses on useful behaviour for tests and local development, ahead of full CloudFront
feature parity. Unsupported CloudFront options may be ignored or may throw errors depending on
whether the simulator needs them to model the requested behaviour safely.

## Limitations

Where sim CloudFront knowingly behaves differently from AWS:

- **The origin events run on every request that reaches the Origin.** Real CloudFront runs
  `origin-request` and `origin-response` on a cache miss, and serves a cache hit without reaching
  either. Simulated CloudFront holds no cache, and every request that gets as far as the Origin is a
  miss here. A request a web ACL blocked or a viewer-request function answered reaches neither
  event, and an `origin-request` function that returns a response leaves the Origin unread with no
  `origin-response` event after it.
- **An Origin keeps its kind and its Bucket through an origin-request function.** Real CloudFront
  lets a handler hand back `origin.s3` where it was given `origin.custom`, or point an S3 Origin at
  another Bucket. Both need something a simulated Origin does not hold, the dispatcher that reaches
  a custom Origin and the Bucket a domain name resolved to when the Distribution was written. Each
  is refused with the 502 a failed edge function gets, carrying the reason. The domain name, the
  Origin path and the custom headers are the parts a handler can rewrite.
- **A custom Origin reports CloudFront's default connection settings.** `keepaliveTimeout`,
  `port`, `protocol`, `readTimeout` and `sslProtocols` are what an origin event carries for every
  custom Origin, whatever `CustomOriginConfig` said, and a handler writing them changes nothing
  about the fetch. Nothing here opens a socket for them to apply to. The `customHeaders` of an S3
  Origin are empty for the same kind of reason. An S3 Origin reads its Bucket through GetObject and
  builds no request for a header to travel on.
- **A custom error page is fetched without the origin events.** CloudFront fetches
  `ResponsePagePath` from the Origin, and an origin function runs for that fetch as it does for any
  other. Here the page is fetched directly. An `origin-request` function that rewrote the Origin
  leaves the error page coming from the Behavior's own Origin.
- **A CDK `EdgeFunction` outside us-east-1 wants the whole cloud assembly.**
  `cloudfront.experimental.EdgeFunction` writes the function into a us-east-1 support stack and
  reads its ARN back through a custom resource in the stack that uses it. `deployCdkOut` deploys
  both stacks and the read finds the ARN. `deployTemplateFile` on the using stack's template alone
  deploys one of them, the read finds nothing, and the Distribution goes up without the
  association, recorded on `stack.ignoredProperties`. `cdk deploy` deploys both either way.
- **Nothing is replicated.** Real Lambda@Edge copies the function out to every Region and creates the
  `AWSServiceRoleForLambdaReplicator` service-linked role to do it. Here the function is invoked
  where it was created. The trust policy and the `lambda:GetFunction` and `lambda:EnableReplication`
  permissions a real association needs are still checked, because those are what a first deploy
  fails on.
- **A Lambda@Edge body is never truncated.** CloudFront caps the body it sends a `viewer-request`
  function and reports `inputTruncated` when it had to cut one. Every simulated body arrives whole
  and `inputTruncated` is always false, so a test finds out nothing about whether its request would
  be too large for a real edge function.
- **The Origin's status decides whether a viewer-response function runs.** CloudFront skips the
  viewer-response event once the Origin answers 400 or higher, and both kinds of function are
  skipped here on that rule. Where the status is replaced further down the pipeline, by a custom
  error response or by an `origin-response` function, the Origin's own status still decides. AWS
  documents the restriction against the Origin's status and says nothing about the status something
  else puts in its place. A Distribution combining the two is where this simulation is guessing. A
  response an `origin-request` function generated has no Origin status behind it, and its own status
  stands in.
- **CloudFront's disallowed and read-only header lists go unchecked.** Real CloudFront answers 502
  when an edge function adds `Connection` or edits `Content-Length`. Both kinds of function here
  write what they like, apart from the viewer-request `host`, which is restored.
- **An S3 Origin with no origin access control reads its Bucket anonymously.** That is the unsigned
  request real CloudFront sends to the S3 REST endpoint without one. The Bucket policy has to make
  an Object publicly readable for the Distribution to serve it. A legacy
  `S3OriginConfig.OriginAccessIdentity` is refused by name. It signs the Origin request as a
  CloudFront canonical user nothing here models, and a Bucket policy written for one would deny the
  read in silence.
- **A signed Origin request carries no signature.** An Origin whose origin access control signs
  reaches the Origin as the `cloudfront.amazonaws.com` service principal carrying the Distribution's
  ARN. That pair is what the Bucket policy or the function's resource policy is evaluated against,
  and no SigV4 signature is computed or checked. A Function URL Origin is told who the request is
  from at the simulated HTTP boundary, the same way anything else calling into simulated AWS in
  process says who it is. No other simulated request is signed here either, and the signature
  itself is beyond what a test can assert on. The payload hash is the one part of a signature that
  is stated and checked, because a Function URL turns a POST away over it. See
  [posting to a Function URL Origin](#posting-to-a-function-url-origin).
- **An origin access control signs for an S3 or Lambda Function URL Origin only.** CloudFront also
  signs for MediaStore and MediaPackage V2 Origins, and both are left out. An
  `OriginAccessControlOriginType` other than `s3` or `lambda`, or a `SigningProtocol` other than
  `sigv4`, fails the Stack by naming the value. Neither is quietly treated as one of the two.
- **An origin access control name is unique, and that is the whole of the checking.** A second one
  claiming a name is refused with `OriginAccessControlAlreadyExists`, as CloudFront refuses one.
- **An origin access control has no command surface.** `CreateOriginAccessControl` and its siblings
  are absent, and `AWS::CloudFront::OriginAccessControl` is the only way to make one.
- **A list's `Quantity` is only checked when it is there.** Every CloudFront list carries a count
  alongside its items, and a `Quantity` that disagrees with `Items` is refused with
  `InconsistentQuantities`, as CloudFront refuses it. A list arriving as a plain array, which is the
  CloudFormation shape, has no count to disagree with, and a template goes unchecked this way. So
  does a hand-written `{ Items: [...] }` with the count left out. The AWS SDK types make omitting
  `Quantity` a compile error, so what arrives without one is a different mistake from the one this
  catches.
- **A web ACL a Distribution names has to exist here.** `WebACLId` resolves to a web ACL created in
  this simulation, and the ARN carries the Account and Region holding it. A managed web ACL, or one
  from a real account, is refused at create and at update. A CloudFormation Distribution is the
  exception and deploys without it, recording the property. Deleting a web ACL a Distribution still
  names leaves the Distribution answering `InvalidWebACLId` on every request, because real WAF
  refuses that deletion and nothing here tracks the association to refuse it.
- **`IfMatch` ETags are ignored on a Distribution or a Function.** `UpdateDistributionCommand`,
  `DeleteDistributionCommand` and `DeleteFunctionCommand` all accept `IfMatch` and ignore it,
  leaving both `PreconditionFailed` and `InvalidIfMatchVersion` unused there. A stale ETag there
  costs a retry. The key value store commands are the exception and do check it, because the data
  API is built around it, and two writers racing on one store is the case it exists to catch.
- **A key value store has no size quota.** CloudFront caps a store's total size and the length of a
  single key and value, and refuses a write that would exceed either. Nothing here counts against a
  quota, and `TotalSizeInBytes` is reported without being enforced. A test can find out nothing
  about whether its data would be too large for a real store.
- **A key value store association is fixed once the Function is created.** There is no
  `UpdateFunction` here, and the store a Function reads is the one it was created with. Delete the
  Function and create it again to change it.
- **A bound handler goes unmeasured.** Function code over CloudFront's 10 KB limit is refused with
  `FunctionSizeLimitExceeded`, counted on the source as uploaded. A handler passed as a function
  reference, through `makeCffFunctionCodeInput` or a CloudFormation binding, carries no source to
  count. The limit reaches only the inline code a real deploy would upload.
- **`ImportSource` is unsupported.** `CreateKeyValueStoreCommand` ignores it, and
  `AWS::CloudFront::KeyValueStore` refuses a Resource carrying one. Nothing here reads an S3 Object
  as key data, and deploying an empty store would let a test pass against data the deploy should
  have seeded. Write the keys with `PutKey` or `UpdateKeys`.
- **A `Status` Output holds the status at deploy time.** CloudFormation Outputs are resolved once,
  while a new store is still `PROVISIONING`, so `Fn::GetAtt` on `Status` in an Output reads
  `PROVISIONING` even though the store goes on to become `READY`. Read the store itself for its
  current status.
- **Key listing is unpaginated.** `ListKeysCommand` and `ListKeyValueStoresCommand` answer with
  everything and never set a `NextToken` or `NextMarker`, leaving a test with no paging loop to
  exercise.
- **A deletion goes ahead without waiting for the disable to deploy.** Real CloudFront needs the
  disabled Distribution to reach `Deployed` before it accepts the deletion. Here, `Enabled: false`
  is enough.
- **A disabled Distribution still serves requests.** Real CloudFront answers a disabled Distribution
  with a 403. Only deleting a Distribution stops it serving here.
- **`DeleteFunctionCommand` never answers `FunctionInUse`.** A CloudFront Function is never told
  that a cache Behavior has taken it up, and every Function is deletable. A Behavior left pointing at a
  deleted Function runs no Function code.
- **A response headers policy name is unique, and that is the whole of the checking.** A second
  policy claiming a name is refused with `ResponseHeadersPolicyAlreadyExists`, as CloudFront refuses
  one. The header names and values themselves are stored as written.
- **A response headers policy has no command surface.** `CreateResponseHeadersPolicy` and its
  siblings are absent, and `AWS::CloudFront::ResponseHeadersPolicy` is the only way to make one.
- **`ServerTimingHeadersConfig` always adds the header once enabled.** `SamplingRate` decides what
  share of real responses carry `Server-Timing`. This simulation adds it to every response once
  `Enabled` is true. A test asserting on it never depends on chance. The header's value is a
  fixed placeholder, since nothing here measures an Origin fetch the way CloudFront's edge does.
- **A cache policy is recorded and never applied.** Sim CloudFront models no edge caching. A policy
  holds its three TTLs and the whole of its cache key, and a Behavior's `CachePolicyId` is checked
  against the policies this simulation holds and reported back. None of it decides anything. Every
  request reaches the Origin, whatever the policy would have cached on real CloudFront.
- **An origin request policy is recorded and never applied.** A Behavior's `OriginRequestPolicyId`
  is checked against the policies this simulation holds and reported back. Sim CloudFront forwards
  the viewer's headers, cookies and query string to the Origin whole, whatever the policy would
  have narrowed them to on real CloudFront.
- **An origin request policy carries its name and its comment, and nothing else.** The
  `HeadersConfig`, `CookiesConfig` and `QueryStringsConfig` of an
  `AWS::CloudFront::OriginRequestPolicy` are read past, since nothing here would act on them.
