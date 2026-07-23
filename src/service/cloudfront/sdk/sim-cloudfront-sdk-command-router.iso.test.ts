import { describe, it } from "vitest";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateFunctionCommand,
  DeleteDistributionCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";
import type { SimCloudFrontFunctionName } from "../cff/sim-cloudfront-function.js";

describe("simulated CloudFront SDK Command routing", () => {
  it("round-trips Distribution Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    await simSdk.simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "origin-bucket" }));

    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const distroCreation = await client.send(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "sdk-intercept-ref-1",
          DefaultRootObject: "index.html",
          Origins: {
            Items: [
              {
                Id: "origin1",
                DomainName: "origin-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            Quantity: 1,
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin1",
            ViewerProtocolPolicy: "redirect-to-https",
            AllowedMethods: { Items: ["GET", "HEAD"], Quantity: 2 },
          },
          Comment: "SDK intercepted distribution",
          Enabled: true,
        },
      }),
    );

    assertNonNullable(distroCreation.Distribution?.Id);
    const distroOut = await client.send(
      new GetDistributionCommand({ Id: distroCreation.Distribution.Id }),
    );

    assertIdentical(distroOut.Distribution?.Id, distroCreation.Distribution.Id);
  });

  it("routes CreateFunctionCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const distroCreation = await client.send(
      new CreateFunctionCommand({
        Name: "intercepted-cff",
        FunctionConfig: {
          Comment: "SDK intercepted CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            return event.request;
          }
        `),
      }),
    );

    assertIdentical(distroCreation.FunctionSummary?.Status, "UNPUBLISHED");
    assertNonNullable(
      simSdk.simAws
        .cloudFront()
        .getCloudFrontFunctionByName(
          "intercepted-cff" as SimCloudFrontFunctionName,
        ),
    );
  });

  it("rejects a Command simulated CloudFront does not support", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new DeleteDistributionCommand({ Id: "D123" }));
    });

    assertStringIncludes(error.message, "DeleteDistributionCommand");
    assertStringIncludes(error.message, "CreateDistributionCommand");
  });
});
