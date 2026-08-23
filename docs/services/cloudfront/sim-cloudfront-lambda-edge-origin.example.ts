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
