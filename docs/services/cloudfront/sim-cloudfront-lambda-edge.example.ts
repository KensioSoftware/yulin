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
