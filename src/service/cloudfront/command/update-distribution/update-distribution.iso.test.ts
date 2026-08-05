import {
  CreateDistributionCommand,
  type DistributionConfig,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertSetSize,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimCloudFrontInvalidViewerCertificate,
  SimCloudFrontNoSuchDistribution,
} from "../../error/sim-cloudfront.error.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

interface Distro {
  readonly simAws: SimAws;
  readonly simCloudFront: SimCloudFront;
  readonly distributionId: string;
}

function distributionConfig(
  overrides: Partial<DistributionConfig> = {},
): DistributionConfig {
  return {
    CallerReference: "updatable-distribution",
    Comment: "Updatable distribution",
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

async function givenDistribution(aliases: string[] = []): Promise<Distro> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "example-bucket" }));

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

  return { simAws, simCloudFront, distributionId: created.Distribution.Id };
}

describe("CloudFront UpdateDistributionCommand", () => {
  it("disables a Distribution", async () => {
    // Given an enabled Distribution.
    const distro = await givenDistribution();
    assertTrue(
      distro.simCloudFront.getSimDistributionById(distro.distributionId)
        ?.enabled,
    );

    // When it is updated with Enabled false.
    const output = await distro.simCloudFront.updateDistribution(
      new UpdateDistributionCommand({
        Id: distro.distributionId,
        IfMatch: "E2QWRUHAPOMQZL",
        DistributionConfig: distributionConfig({ Enabled: false }),
      }),
    );

    // Then CloudFront redeploys the Distribution as disabled.
    assertIdentical(output.Distribution?.Status, "Deploying");
    assertFalse(output.Distribution.DistributionConfig?.Enabled);
    assertFalse(
      distro.simCloudFront.getSimDistributionById(distro.distributionId)
        ?.enabled,
    );

    await distro.simAws.backgroundTasksComplete();
    const read = await distro.simCloudFront.getDistribution(
      new GetDistributionCommand({ Id: distro.distributionId }),
    );
    assertIdentical(read.Distribution?.Status, "Deployed");
  });

  it("applies a replacement configuration rather than merging it", async () => {
    // Given a Distribution with a default root object and an alternate domain.
    const distro = await givenDistribution(["cdn.updatable.test"]);
    await distro.simCloudFront.updateDistribution(
      new UpdateDistributionCommand({
        Id: distro.distributionId,
        DistributionConfig: distributionConfig({
          DefaultRootObject: "index.html",
          Aliases: { Quantity: 1, Items: ["cdn.updatable.test"] },
        }),
      }),
    );
    const configured = distro.simCloudFront.getSimDistributionById(
      distro.distributionId,
    );
    assertIdentical(configured?.defaultRootObject, "index.html");

    // When the Distribution is updated with neither of them.
    await distro.simCloudFront.updateDistribution(
      new UpdateDistributionCommand({
        Id: distro.distributionId,
        DistributionConfig: distributionConfig(),
      }),
    );

    // Then both are gone, as CloudFront takes the whole config.
    const updated = distro.simCloudFront.getSimDistributionById(
      distro.distributionId,
    );
    assertNonNullable(updated);
    assertUndefined(updated.defaultRootObject);
    assertSetSize(updated.getAlternateDomainNames(), 0);
    assertUndefined(
      distro.simAws.serviceFactory.cloudFrontRegistry.distributionIdForAlternateDomainName(
        "cdn.updatable.test",
      ),
    );
  });

  it("moves an alternate domain name to the Distribution now holding it", async () => {
    // Given a Distribution answering on an alternate domain name.
    const distro = await givenDistribution(["moved.updatable.test"]);
    const registry = distro.simAws.serviceFactory.cloudFrontRegistry;
    assertIdentical(
      registry.distributionIdForAlternateDomainName("moved.updatable.test"),
      distro.distributionId,
    );

    // When the name is replaced with another one.
    await distro.simCloudFront.updateDistribution(
      new UpdateDistributionCommand({
        Id: distro.distributionId,
        DistributionConfig: distributionConfig({
          Aliases: { Quantity: 1, Items: ["renamed.updatable.test"] },
        }),
      }),
    );

    // Then the old registration goes and the new one takes its place, so the
    // old name is free for another Distribution.
    assertUndefined(
      registry.distributionIdForAlternateDomainName("moved.updatable.test"),
    );
    assertIdentical(
      registry.distributionIdForAlternateDomainName("renamed.updatable.test"),
      distro.distributionId,
    );
  });

  it("refuses an alternate domain name another Distribution holds", async () => {
    // Given two Distributions, one of them answering on an alternate domain
    // name.
    const distro = await givenDistribution(["taken.updatable.test"]);
    const other = await distro.simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig({
          CallerReference: "other-distribution",
          Aliases: { Quantity: 1, Items: ["own.updatable.test"] },
        }),
      }),
    );
    await distro.simAws.backgroundTasksComplete();
    assertNonNullable(other.Distribution?.Id);

    // When the second Distribution is updated to claim the first one's name.
    await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.updateDistribution(
        new UpdateDistributionCommand({
          Id: other.Distribution?.Id,
          DistributionConfig: distributionConfig({
            CallerReference: "other-distribution",
            Aliases: { Quantity: 1, Items: ["taken.updatable.test"] },
          }),
        }),
      ),
    );

    // Then it is left as it was, rather than half updated: it still answers on
    // its own name, and the name it tried to take still routes to the first
    // Distribution.
    const registry = distro.simAws.serviceFactory.cloudFrontRegistry;
    assertIdentical(
      registry.distributionIdForAlternateDomainName("own.updatable.test"),
      other.Distribution.Id,
    );
    assertIdentical(
      registry.distributionIdForAlternateDomainName("taken.updatable.test"),
      distro.distributionId,
    );
  });

  it("refuses an unusable viewer certificate, leaving the Distribution alone", async () => {
    // Given an enabled Distribution.
    const distro = await givenDistribution();

    // When it is updated with a certificate ARN that resolves to nothing.
    const error = await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.updateDistribution(
        new UpdateDistributionCommand({
          Id: distro.distributionId,
          DistributionConfig: distributionConfig({
            Enabled: false,
            ViewerCertificate: {
              ACMCertificateArn:
                "arn:aws:acm:us-east-1:123456789012:certificate/missing",
              SSLSupportMethod: "sni-only",
            },
          }),
        }),
      ),
    );

    // Then CloudFront rejects the whole request and nothing is applied.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertTrue(
      distro.simCloudFront.getSimDistributionById(distro.distributionId)
        ?.enabled,
    );
  });

  it("rejects a Distribution that does not exist", async () => {
    // Given a simulated CloudFront without the requested Distribution.
    const simCloudFront = new SimAws().cloudFront();

    // When the missing Distribution is updated.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.updateDistribution(
        new UpdateDistributionCommand({
          Id: "EMISSINGDISTRIB",
          DistributionConfig: distributionConfig(),
        }),
      ),
    );

    // Then CloudFront answers with its missing-Distribution error.
    assertInstanceOf(error, SimCloudFrontNoSuchDistribution);
  });

  it("requires a DistributionConfig", async () => {
    // Given an existing Distribution.
    const distro = await givenDistribution();

    // When an update arrives without a config.
    const error = await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.updateDistribution(
        new UpdateDistributionCommand({
          Id: distro.distributionId,
          DistributionConfig: undefined,
        }),
      ),
    );

    // Then it is refused rather than emptying the Distribution.
    assertInstanceOf(error, Error);
  });

  it("denies a caller without UpdateDistribution permission", async () => {
    // Given a Distribution in a simulation with IAM.
    const distro = await givenDistribution();

    // When an anonymous caller updates it.
    const error = await assertThrowsErrorAsync(async () =>
      distro.simCloudFront.updateDistribution(
        new UpdateDistributionCommand({
          Id: distro.distributionId,
          DistributionConfig: distributionConfig({ Enabled: false }),
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies the action, and the Distribution stays enabled.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:UpdateDistribution");
    assertTrue(
      distro.simCloudFront.getSimDistributionById(distro.distributionId)
        ?.enabled,
    );
  });
});
