import { describe, it } from "vitest";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateFunctionCommand,
  CreateInvalidationCommand,
  DeleteDistributionCommand,
  DeleteFunctionCommand,
  DescribeFunctionCommand,
  GetDistributionCommand,
  GetFunctionCommand,
  GetInvalidationCommand,
  ListDistributionsCommand,
  ListFunctionsCommand,
  ListInvalidationsCommand,
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

  it("reads a Function back through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const functionCode = `
          function handler(event) {
            return event.request;
          }
        `;
    await client.send(
      new CreateFunctionCommand({
        Name: "readable-cff",
        FunctionConfig: {
          Comment: "SDK intercepted CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(functionCode),
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    // Listing, describing and getting all go through the router.
    const listed = await client.send(new ListFunctionsCommand({}));
    assertIdentical(
      listed.FunctionList?.Items?.[0]?.FunctionConfig?.Runtime,
      "cloudfront-js-2.0",
    );

    const described = await client.send(
      new DescribeFunctionCommand({ Name: "readable-cff" }),
    );
    assertIdentical(
      described.FunctionSummary?.FunctionConfig?.Comment,
      "SDK intercepted CloudFront Function",
    );

    const got = await client.send(
      new GetFunctionCommand({ Name: "readable-cff", Stage: "LIVE" }),
    );
    assertNonNullable(got.FunctionCode);
    assertIdentical(Buffer.from(got.FunctionCode).toString(), functionCode);
  });

  it("round-trips invalidation Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    await simSdk.simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "invalidated-bucket" }));

    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const distroCreation = await client.send(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "sdk-invalidation-ref-1",
          Origins: {
            Items: [
              {
                Id: "origin1",
                DomainName: "invalidated-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            Quantity: 1,
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin1",
            ViewerProtocolPolicy: "redirect-to-https",
          },
          Comment: "SDK intercepted invalidations",
          Enabled: true,
        },
      }),
    );

    assertNonNullable(distroCreation.Distribution?.Id);
    const distributionId = distroCreation.Distribution.Id;

    const invalidation = await client.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: "sdk-invalidation-batch-1",
          Paths: { Quantity: 1, Items: ["/*"] },
        },
      }),
    );

    assertNonNullable(invalidation.Invalidation?.Id);

    const got = await client.send(
      new GetInvalidationCommand({
        DistributionId: distributionId,
        Id: invalidation.Invalidation.Id,
      }),
    );
    const listing = await client.send(
      new ListInvalidationsCommand({ DistributionId: distributionId }),
    );

    assertIdentical(got.Invalidation?.Id, invalidation.Invalidation.Id);
    assertIdentical(listing.InvalidationList?.Quantity, 1);
    assertIdentical(
      listing.InvalidationList.Items?.[0]?.Id,
      invalidation.Invalidation.Id,
    );
  });

  it("rejects a Command simulated CloudFront does not support", async () => {
    using simSdk = new SimSdk();
    const client = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new ListDistributionsCommand({}));
    });

    assertStringIncludes(error.message, "ListDistributionsCommand");
    assertStringIncludes(error.message, "CreateDistributionCommand");
  });
});
