import {
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCfOacCloudFrontReadStatement,
  simCfOacPublicReadStatement,
  simCfOacSiteBucketName,
  simCfOacSiteDistributionArn,
  simCfOacSitePage,
  simCfOacSiteStack,
} from "../../../../../test/cloudfront/oac-site-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

/**
 * Serving a private Bucket through an origin access control.
 *
 * An Origin whose origin access control signs reads its Bucket as the
 * CloudFront service principal, carrying the Distribution's ARN as
 * `aws:SourceArn`. The Bucket policy is then the whole decision, which is the
 * mistake worth catching locally: a condition naming the wrong Distribution, or
 * an Origin that was never given an origin access control, looks identical to a
 * correct one until the site 403s on deploy.
 */
describe("Simulated CloudFront S3 Origin with an origin access control", () => {
  it("serves a page the Bucket policy grants this Distribution", async () => {
    // Given a Bucket admitting CloudFront reads made by this Distribution.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "always",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the signed read is allowed and the page is served.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), simCfOacSitePage);
  });

  it("signs the read for a no-override signing behaviour too", async () => {
    // Given the same grant, and an origin access control that signs a request
    // the viewer did not sign, which is every request reaching an Origin here.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "no-override",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then it is served, as it is for `always`.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), simCfOacSitePage);
  });

  it("refuses a read the Bucket policy grants a different Distribution", async () => {
    // Given the same grant, conditioned on somebody else's Distribution ARN.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "always",
      statement: simCfOacCloudFrontReadStatement(
        "arn:aws:cloudfront::111111111111:distribution/E1OTHERONE1234",
      ),
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the condition does not match this Distribution and the read is
    // refused, which is the mistake a deploy would otherwise be the first to
    // report.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses an Origin that was never given an origin access control", async () => {
    // Given a Bucket admitting only CloudFront, and an Origin with nothing to
    // sign the read with.
    const { simAws, distributionId } = await simCfOacSiteStack({
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the unsigned read is refused, as it is in real CloudFront.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses an anonymous SDK caller reading the same Bucket", async () => {
    // Given the Bucket admitting only CloudFront.
    const { simAws } = await simCfOacSiteStack({
      signingBehavior: "always",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
    });

    // When something outside the Distribution reads the Object.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .s3()
        .getObject(
          { input: { Bucket: simCfOacSiteBucketName, Key: "index.html" } },
          { caller: { kind: "anonymous" } },
        );
    });

    // Then the grant written for CloudFront does nothing for it.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reads anonymously when the signing behaviour is never", async () => {
    // Given an origin access control turned off without being removed.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "never",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then nothing signed the read and the CloudFront grant does not cover it.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("serves a publicly readable page when the signing behaviour is never", async () => {
    // Given the same Origin over a Bucket anyone may read.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "never",
      statement: simCfOacPublicReadStatement,
      publicPolicyAllowed: true,
    });

    // When a viewer asks for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the anonymous read is what serves it.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), simCfOacSitePage);
  });
});
