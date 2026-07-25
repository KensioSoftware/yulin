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
