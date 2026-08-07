import {
  CreateDistributionCommand,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import { SimCloudFrontServiceController } from "../../controller/sim-cloudfront-controller.js";

/**
 * A minimal DistributionConfig with one S3 Origin on the given domain.
 */
function distributionConfig(originDomainName: string): DistributionConfig {
  return {
    CallerReference: `s3-origin-${originDomainName}`,
    Comment: "S3 Origin resolution test distribution",
    Enabled: true,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "site-origin",
          DomainName: originDomainName,
          S3OriginConfig: { OriginAccessIdentity: "" },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "site-origin",
      ViewerProtocolPolicy: "allow-all",
    },
  };
}

/**
 * Make a request through a Distribution over its CloudFront hostname.
 */
async function fetchThroughDistribution(
  simAws: SimAws,
  distributionId: string,
  path: string,
): Promise<Response> {
  const host = `${distributionId}.cloudfront.net.sim-aws.localhost`;

  return new SimCloudFrontServiceController({ simAws }).handleRequest(
    new SimAwsServiceRequest({
      target: { service: "cloudFront", resourceName: "" },
      request: new Request(`http://${host}${path}`, { headers: { host } }),
    }),
  );
}

describe("Sim CloudFront S3 Origin Bucket resolution", () => {
  it("serves an S3 Origin Bucket owned by another Account", async () => {
    // Given a Bucket holding a page in one Account.
    const simAws = new SimAws();
    const bucketS3 = simAws.account("222222222222").region("eu-west-2").s3();

    await bucketS3.createBucket(
      new CreateBucketCommand({ Bucket: "other-account-bucket" }),
    );
    await bucketS3.putObject(
      new PutObjectCommand({
        Bucket: "other-account-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>From the other Account</h1>",
      }),
    );
    await grantPublicObjectRead(bucketS3, "other-account-bucket");

    // When a Distribution in a different Account takes it as an S3 Origin.
    const distributionCreation = await simAws
      .account("111111111111")
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            "other-account-bucket.s3.eu-west-2.amazonaws.com",
          ),
        }),
      );

    const distributionId = distributionCreation.Distribution?.Id;
    assertNonNullable(distributionId);

    // Then the Distribution is created, and a request through it reads the
    // Bucket in the Account that owns it.
    const response = await fetchThroughDistribution(
      simAws,
      distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>From the other Account</h1>");
  });

  it("serves an S3 Origin Bucket in another Region of the same Account", async () => {
    // Given a Bucket holding a page in one Region of an Account.
    const simAws = new SimAws();
    const account = simAws.account("111111111111");
    const bucketS3 = account.region("us-east-1").s3();

    await bucketS3.createBucket(
      new CreateBucketCommand({ Bucket: "other-region-bucket" }),
    );
    await bucketS3.putObject(
      new PutObjectCommand({
        Bucket: "other-region-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>From the other Region</h1>",
      }),
    );
    await grantPublicObjectRead(bucketS3, "other-region-bucket");

    // When a Distribution created in another Region of that Account takes it
    // as an S3 Origin.
    const distributionCreation = await account
      .region("eu-west-2")
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            "other-region-bucket.s3.us-east-1.amazonaws.com",
          ),
        }),
      );

    const distributionId = distributionCreation.Distribution?.Id;
    assertNonNullable(distributionId);

    // Then the Origin still resolves to that Bucket and serves from it.
    const response = await fetchThroughDistribution(
      simAws,
      distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>From the other Region</h1>");
  });

  it("refuses an Origin domain naming no Bucket in any Account", async () => {
    // Given a simulation holding a Bucket of another name.
    const simAws = new SimAws();

    await simAws
      .account("222222222222")
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "a-different-bucket" }));

    // When a Distribution names a Bucket no Account has.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account("111111111111")
        .cloudFront()
        .createDistribution(
          new CreateDistributionCommand({
            DistributionConfig: distributionConfig(
              "no-such-bucket.s3.eu-west-2.amazonaws.com",
            ),
          }),
        );
    });

    // Then creation fails saying which Bucket could not be found.
    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Unable to find sim S3 Bucket no-such-bucket for sim CloudFront S3 Origin",
    );
  });
});
