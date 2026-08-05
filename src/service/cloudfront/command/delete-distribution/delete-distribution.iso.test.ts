import {
  CreateDistributionCommand,
  DeleteDistributionCommand,
  type DistributionConfig,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimCloudFrontServiceController } from "../../controller/sim-cloudfront-controller.js";
import {
  SimCloudFrontDistributionNotDisabled,
  SimCloudFrontNoSuchDistribution,
} from "../../error/sim-cloudfront.error.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

interface Distro {
  readonly simAws: SimAws;
  readonly simCloudFront: SimCloudFront;
  readonly distributionId: string;
  readonly aliases: string[];
}

function distributionConfig(
  overrides: Partial<DistributionConfig> = {},
): DistributionConfig {
  return {
    CallerReference: "deletable-distribution",
    Comment: "Deletable distribution",
    Enabled: true,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "SiteOrigin",
          DomainName: "example-bucket.s3.amazonaws.com",
          S3OriginConfig: { OriginAccessIdentity: "" },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "SiteOrigin",
      ViewerProtocolPolicy: "allow-all",
    },
    ...overrides,
  };
}

/**
 * Create a Distribution over an S3 Origin holding one object, so a request to
 * it has something to answer with.
 */
async function givenDistribution(aliases: string[] = []): Promise<Distro> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "example-bucket" }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "example-bucket",
      Key: "index.html",
      ContentType: "text/html",
      Body: "<h1>Served</h1>",
    }),
  );

  const simCloudFront = simAws.cloudFront();
  const created = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: distributionConfig({
        Aliases: { Quantity: aliases.length, Items: aliases },
      }),
    }),
  );
  await simAws.backgroundTasksComplete();
  assertNonNullable(created.Distribution?.Id);

  return {
    simAws,
    simCloudFront,
    distributionId: created.Distribution.Id,
    aliases,
  };
}

async function disable(distro: Distro): Promise<void> {
  await distro.simCloudFront.updateDistribution(
    new UpdateDistributionCommand({
      Id: distro.distributionId,
      IfMatch: "E2QWRUHAPOMQZL",
      DistributionConfig: distributionConfig({
        Enabled: false,
        Aliases: { Quantity: distro.aliases.length, Items: distro.aliases },
      }),
    }),
  );
  await distro.simAws.backgroundTasksComplete();
}

async function requestDistribution(
  distro: Distro,
  hostname: string,
): Promise<Response> {
  return await new SimCloudFrontServiceController({
    simAws: distro.simAws,
  }).handleRequest(
    new SimAwsServiceRequest({
      target: { service: "cloudFront", resourceName: "" },
      request: new Request(`http://${hostname}.sim-aws.localhost/index.html`),
    }),
  );
}

describe("CloudFront DeleteDistributionCommand", () => {
  it("deletes a disabled Distribution", async () => {
    // Given a Distribution that has been disabled.
    const distro = await givenDistribution();
    await disable(distro);

    // When the Distribution is deleted.
    const output = await distro.simCloudFront.deleteDistribution(
      new DeleteDistributionCommand({ Id: distro.distributionId }),
    );

    // Then CloudFront accepts it, and the Distribution is gone.
    assertIdentical(output.$metadata.httpStatusCode, 204);

    await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.getDistribution(
        new GetDistributionCommand({ Id: distro.distributionId }),
      ),
    );
  });

  it("refuses a Distribution that is still enabled", async () => {
    // Given a Distribution left enabled.
    const distro = await givenDistribution();

    // When the Distribution is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.deleteDistribution(
        new DeleteDistributionCommand({ Id: distro.distributionId }),
      ),
    );

    // Then CloudFront refuses, leaving the caller to disable it first.
    assertInstanceOf(error, SimCloudFrontDistributionNotDisabled);
    assertIdentical(error.$metadata.httpStatusCode, 409);
    assertNonNullable(
      distro.simCloudFront.getSimDistributionById(distro.distributionId),
    );
  });

  it("stops a request to the Distribution domain resolving to it", async () => {
    // Given a disabled Distribution still answering on its CloudFront domain.
    const distro = await givenDistribution();
    await disable(distro);
    const cloudFrontDomain = `${distro.distributionId.toLowerCase()}.cloudfront.net`;

    assertResponseStatus(
      await requestDistribution(distro, cloudFrontDomain),
      200,
    );

    // When the Distribution is deleted.
    await distro.simCloudFront.deleteDistribution(
      new DeleteDistributionCommand({ Id: distro.distributionId }),
    );

    // Then a request to its domain no longer resolves to it.
    assertResponseStatus(
      await requestDistribution(distro, cloudFrontDomain),
      404,
    );
  });

  it("frees the alternate domain names the Distribution answered on", async () => {
    // Given a disabled Distribution with an alternate domain name.
    const distro = await givenDistribution(["cdn.deletable.test"]);
    await disable(distro);

    assertResponseStatus(
      await requestDistribution(distro, "cdn.deletable.test"),
      200,
    );

    // When the Distribution is deleted.
    await distro.simCloudFront.deleteDistribution(
      new DeleteDistributionCommand({ Id: distro.distributionId }),
    );

    // Then the alternate domain name routes to nothing, and is free again.
    assertResponseStatus(
      await requestDistribution(distro, "cdn.deletable.test"),
      404,
    );
    assertUndefined(
      distro.simAws.serviceFactory.cloudFrontRegistry.distributionIdForAlternateDomainName(
        "cdn.deletable.test",
      ),
    );
  });

  it("rejects a Distribution that does not exist", async () => {
    // Given a simulated CloudFront without the requested Distribution.
    const simCloudFront = new SimAws().cloudFront();

    // When the missing Distribution is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.deleteDistribution(
        new DeleteDistributionCommand({ Id: "EMISSINGDISTRIB" }),
      ),
    );

    // Then CloudFront answers with its missing-Distribution error.
    assertInstanceOf(error, SimCloudFrontNoSuchDistribution);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("requires a Distribution ID", async () => {
    // Given a simulated CloudFront.
    const simCloudFront = new SimAws().cloudFront();

    // When a deletion arrives without an ID.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.deleteDistribution(
        new DeleteDistributionCommand({ Id: undefined }),
      ),
    );

    // Then it is refused before anything is deleted.
    assertInstanceOf(error, Error);
  });

  it("denies a caller without DeleteDistribution permission", async () => {
    // Given a disabled Distribution in a simulation with IAM.
    const distro = await givenDistribution();
    await disable(distro);

    // When an anonymous caller deletes it.
    const error = await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.deleteDistribution(
        new DeleteDistributionCommand({ Id: distro.distributionId }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies the removal action, and the Distribution stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:DeleteDistribution");
    assertNonNullable(
      distro.simCloudFront.getSimDistributionById(distro.distributionId),
    );
  });
});
