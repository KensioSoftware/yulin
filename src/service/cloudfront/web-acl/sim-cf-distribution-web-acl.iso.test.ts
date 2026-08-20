import {
  CreateDistributionCommand,
  type DistributionConfig,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../../wafv2/command/web-acl/sim-waf-create-web-acl.factory.js";
import { simWafCloudFrontRegion } from "../../wafv2/scope/sim-waf-scope.js";
import { createSimWafWebAcl } from "../../wafv2/sim-wafv2.fixture.js";
import { SimCloudFrontInvalidWebAclId } from "../error/sim-cloudfront.error.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
} from "../../../../test/cloudfront/site-fixture.js";

/** The Bucket every Distribution here serves from. */
const bucketName = "web-acl-site";

/** An ARN of the right shape naming a web ACL nothing created. */
const missingWebAclArn =
  "arn:aws:wafv2:us-east-1:111111111111:global/webacl/gone/" +
  "4a2b1c8d-0e6f-4a2b-9c8d-0e6f4a2b1c8d";

/**
 * A simulated AWS with the Bucket every Distribution here is in front of.
 */
async function simAwsWithSite(): Promise<SimAws> {
  const simAws = new SimAws();
  await simCfSiteBucket(simAws, bucketName, { "index.html": "<h1>Home</h1>" });

  return simAws;
}

/**
 * The ARN of a new web ACL in the scope named.
 *
 * Both scopes are created in us-east-1, which is where a `CLOUDFRONT` scope
 * web ACL has to live, so the two differ by scope and nothing else.
 */
async function webAclArn(
  simAws: SimAws,
  scope: "CLOUDFRONT" | "REGIONAL",
): Promise<string> {
  const created = await createSimWafWebAcl(
    simAws.region(simWafCloudFrontRegion).account().wafV2(),
    simWafCreateWebAclFactory.make({ Scope: scope }),
  );

  return created.ARN;
}

/** The site DistributionConfig, behind the web ACL named. */
function siteConfig(webAclId?: string): DistributionConfig {
  return simCfSiteDistributionConfig(
    bucketName,
    webAclId === undefined ? {} : { WebACLId: webAclId },
  );
}

describe("A sim CloudFront Distribution's web ACL", () => {
  it("reports back the web ACL a Distribution was created with", async () => {
    // Given a CLOUDFRONT scope web ACL.
    const simAws = await simAwsWithSite();
    const arn = await webAclArn(simAws, "CLOUDFRONT");

    // When a Distribution is created naming it.
    const creation = await simAws
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({ DistributionConfig: siteConfig(arn) }),
      );

    // Then the Distribution the API answered with carries it, and so does the
    // Distribution serving requests.
    const distributionId = creation.Distribution?.Id;
    assertNonNullable(distributionId);
    assertIdentical(creation.Distribution?.DistributionConfig?.WebACLId, arn);
    assertIdentical(
      simAws.cloudFront().getSimDistributionById(distributionId)?.webAclArn,
      arn,
    );
  });

  it("takes an empty WebACLId as no web ACL at all", async () => {
    // Given a Distribution described the way CloudFormation describes one that
    // was never given a web ACL.
    const simAws = await simAwsWithSite();
    const distributionId = await simCfSiteDistributionId(
      simAws,
      siteConfig(""),
    );

    // Then it is behind no web ACL, rather than behind one named by an empty
    // ARN.
    assertUndefined(
      simAws.cloudFront().getSimDistributionById(distributionId)?.webAclArn,
    );
  });

  it("refuses a Distribution naming a web ACL that does not exist", async () => {
    // Given a simulation holding no web ACLs.
    const simAws = await simAwsWithSite();

    // When a Distribution is created naming one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: siteConfig(missingWebAclArn),
        }),
      );
    });

    // Then CloudFront refuses it, as it refuses a missing response headers
    // policy, rather than serving every request as though there were no web
    // ACL.
    assertInstanceOf(error, SimCloudFrontInvalidWebAclId);
    assertStringIncludes(error.message, missingWebAclArn);
    assertMapSize(simAws.cloudFront().getDistributions(), 0);
  });

  it("refuses a Distribution naming a REGIONAL scope web ACL", async () => {
    // Given a REGIONAL scope web ACL, which fronts a stage or a load balancer
    // rather than a Distribution.
    const simAws = await simAwsWithSite();
    const arn = await webAclArn(simAws, "REGIONAL");

    // When a Distribution is created naming it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: siteConfig(arn),
        }),
      );
    });

    // Then CloudFront refuses it, as real WAF does.
    assertInstanceOf(error, SimCloudFrontInvalidWebAclId);
    assertStringIncludes(error.message, "REGIONAL");
  });

  it("takes the web ACL an update names, and drops the one it leaves out", async () => {
    // Given a Distribution behind a web ACL.
    const simAws = await simAwsWithSite();
    const arn = await webAclArn(simAws, "CLOUDFRONT");
    const distributionId = await simCfSiteDistributionId(
      simAws,
      siteConfig(arn),
    );
    const distribution = simAws
      .cloudFront()
      .getSimDistributionById(distributionId);
    assertNonNullable(distribution);

    // When an update names another one.
    const replacementArn = await webAclArn(simAws, "CLOUDFRONT");
    await simAws.cloudFront().updateDistribution(
      new UpdateDistributionCommand({
        Id: distributionId,
        DistributionConfig: siteConfig(replacementArn),
      }),
    );

    // Then the Distribution is behind the one that update named.
    assertIdentical(distribution.webAclArn, replacementArn);

    // And an update naming none leaves it behind nothing.
    await simAws.cloudFront().updateDistribution(
      new UpdateDistributionCommand({
        Id: distributionId,
        DistributionConfig: siteConfig(),
      }),
    );

    assertUndefined(distribution.webAclArn);
  });

  it("refuses an update naming a web ACL that does not exist", async () => {
    // Given a Distribution behind a web ACL.
    const simAws = await simAwsWithSite();
    const arn = await webAclArn(simAws, "CLOUDFRONT");
    const distributionId = await simCfSiteDistributionId(
      simAws,
      siteConfig(arn),
    );

    // When an update names one that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().updateDistribution(
        new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: siteConfig(missingWebAclArn),
        }),
      );
    });

    // Then the update is refused, and the Distribution is left behind the web
    // ACL it already had rather than half replaced.
    assertInstanceOf(error, SimCloudFrontInvalidWebAclId);
    assertIdentical(
      simAws.cloudFront().getSimDistributionById(distributionId)?.webAclArn,
      arn,
    );
  });

  it("refuses an update naming a REGIONAL scope web ACL", async () => {
    // Given a Distribution behind a CLOUDFRONT scope web ACL.
    const simAws = await simAwsWithSite();
    const arn = await webAclArn(simAws, "CLOUDFRONT");
    const distributionId = await simCfSiteDistributionId(
      simAws,
      siteConfig(arn),
    );

    // When an update names a REGIONAL scope one instead.
    const regionalArn = await webAclArn(simAws, "REGIONAL");
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().updateDistribution(
        new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: siteConfig(regionalArn),
        }),
      );
    });

    // Then the update is refused and the Distribution keeps serving behind the
    // web ACL it had.
    assertInstanceOf(error, SimCloudFrontInvalidWebAclId);
    assertIdentical(
      simAws.cloudFront().getSimDistributionById(distributionId)?.webAclArn,
      arn,
    );
  });
});
