import { describe, it } from "vitest";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateFunctionCommand,
  CreateInvalidationCommand,
  DeleteDistributionCommand,
  DeleteFunctionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

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
    const distributionId = distroCreation.Distribution.Id;
    const distroOut = await client.send(
      new GetDistributionCommand({ Id: distributionId }),
    );

    assertIdentical(distroOut.Distribution?.Id, distributionId);

    // Disabling and then deleting goes through the router the same way.
    await client.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: "E2QWRUHAPOMQZL",
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
          Enabled: false,
        },
      }),
    );
    await client.send(new DeleteDistributionCommand({ Id: distributionId }));

    assertUndefined(
      simSdk.simAws.cloudFront().getSimDistributionById(distributionId),
    );
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
      simSdk.simAws.cloudFront().getCloudFrontFunctionByName("intercepted-cff"),
    );

    // Deleting it again goes through the router the same way.
    await client.send(
      new DeleteFunctionCommand({
        Name: "intercepted-cff",
        IfMatch: "E2QWRUHAPOMQZL",
      }),
    );

    assertUndefined(
      simSdk.simAws.cloudFront().getCloudFrontFunctionByName("intercepted-cff"),
    );
  });

  it("rejects a Command simulated CloudFront does not support", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new CreateInvalidationCommand({
          DistributionId: "D123",
          InvalidationBatch: {
            CallerReference: "unsupported",
            Paths: { Quantity: 1, Items: ["/*"] },
          },
        }),
      );
    });

    assertStringIncludes(error.message, "CreateInvalidationCommand");
    assertStringIncludes(error.message, "CreateDistributionCommand");
  });
});
