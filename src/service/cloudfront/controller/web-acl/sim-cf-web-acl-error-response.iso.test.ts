import type { CustomErrorResponses } from "@aws-sdk/client-cloudfront";
import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../../../wafv2/command/web-acl/sim-waf-create-web-acl.factory.js";
import { simWafCloudFrontRegion } from "../../../wafv2/scope/sim-waf-scope.js";
import { createSimWafWebAcl } from "../../../wafv2/sim-wafv2.fixture.js";
import type { SimWafActionInput } from "../../../wafv2/web-acl/sim-waf-action.type.js";
import type { SimWafCustomResponseBodies } from "../../../wafv2/web-acl/sim-waf-custom-response.type.js";
import { simWafRuleFactory } from "../../../wafv2/web-acl/sim-waf-rule.factory.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";

describe("A sim CloudFront Distribution answering a request its web ACL blocks", () => {
  /** The header a probing request carries, which the web ACL blocks on. */
  const probeHeaders = { "x-probe": "attack" };

  /**
   * The 403 and 404 rules a static site behind CloudFront usually has, both
   * serving one not-found page with a 404.
   */
  const notFoundPageResponses: CustomErrorResponses = {
    Quantity: 2,
    Items: [
      { ErrorCode: 403, ResponsePagePath: "/404.html", ResponseCode: "404" },
      { ErrorCode: 404, ResponsePagePath: "/404.html", ResponseCode: "404" },
    ],
  };

  /**
   * A CLOUDFRONT scope web ACL whose one rule claims any request carrying the
   * probe header, and takes the action given.
   */
  async function probeWebAclArn(
    simAws: SimAws,
    action: SimWafActionInput,
    customResponseBodies?: SimWafCustomResponseBodies,
  ): Promise<string> {
    const created = await createSimWafWebAcl(
      simAws.region(simWafCloudFrontRegion).account().wafV2(),
      simWafCreateWebAclFactory.make({
        Scope: "CLOUDFRONT",
        CustomResponseBodies: customResponseBodies,
        Rules: [
          {
            ...simWafRuleFactory.make({ Name: "probes" }),
            Action: action,
            Statement: {
              ByteMatchStatement: {
                SearchString: "attack",
                PositionalConstraint: "EXACTLY",
                FieldToMatch: { SingleHeader: { Name: "x-probe" } },
                TextTransformations: [{ Priority: 0, Type: "NONE" }],
              },
            },
          },
        ],
      }),
    );

    return created.ARN;
  }

  /**
   * A Bucket of a home page and a not-found page, under a name no other test
   * is using.
   */
  async function siteBucketName(simAws: SimAws): Promise<string> {
    const bucketName = `site-${faker.string.alphanumeric(12).toLowerCase()}`;
    await simCfSiteBucket(simAws, bucketName, {
      "index.html": "<h1>Home</h1>",
      "404.html": "<h1>Not found here</h1>",
    });

    return bucketName;
  }

  it("serves the 403 custom error response in place of WAF's own 403", async () => {
    // Given a site mapping 403 and 404 to its not-found page, behind a web ACL
    // that blocks probes.
    const simAws = new SimAws();
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig(await siteBucketName(simAws), {
        WebACLId: await probeWebAclArn(simAws, { Block: {} }),
        CustomErrorResponses: notFoundPageResponses,
      }),
    );

    // When a probe asks for the home page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
      { headers: probeHeaders },
    );

    // Then the viewer gets the not-found page with a 404, as it would for a
    // 403 from the Origin, because CloudFront cannot tell the two apart.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Not found here</h1>");
  });

  it("answers with WAF's own 403 where no custom error response covers 403", async () => {
    // Given a site with a custom error response for 404 only, behind the same
    // web ACL.
    const simAws = new SimAws();
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig(await siteBucketName(simAws), {
        WebACLId: await probeWebAclArn(simAws, { Block: {} }),
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
      }),
    );

    // When a probe asks for the home page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
      { headers: probeHeaders },
    );

    // Then the 403 from WAF reaches the viewer unchanged.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertStringIncludes(await response.text(), "Request blocked by AWS WAF");
  });

  it("answers with the block action's custom response over a 403 custom error response", async () => {
    // Given a web ACL whose block action names a 403 custom response of its
    // own, in front of a site with a custom error response for 403.
    const simAws = new SimAws();
    const webAclArn = await probeWebAclArn(
      simAws,
      {
        Block: {
          CustomResponse: {
            ResponseCode: 403,
            CustomResponseBodyKey: "probe-refused",
          },
        },
      },
      {
        "probe-refused": {
          ContentType: "TEXT_PLAIN",
          Content: "Probes are not welcome",
        },
      },
    );
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig(await siteBucketName(simAws), {
        WebACLId: webAclArn,
        CustomErrorResponses: notFoundPageResponses,
      }),
    );

    // When a probe asks for the home page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
      { headers: probeHeaders },
    );

    // Then the WAF custom response wins outright, even though its status is
    // one the Distribution has a custom error response for.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(await response.text(), "Probes are not welcome");
  });

  it("leaves the cache to the next viewer of the same page", async () => {
    // Given a caching site with custom error responses, behind the web ACL.
    const simAws = new SimAws();
    const bucketName = await siteBucketName(simAws);
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig(bucketName, {
        WebACLId: await probeWebAclArn(simAws, { Block: {} }),
        CustomErrorResponses: notFoundPageResponses,
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
        },
      }),
    );

    // When a probe is blocked on the home page, and an ordinary viewer asks
    // for the same page straight after.
    const blocked = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
      { headers: probeHeaders },
    );
    const allowed = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the probe got the not-found page and the viewer got the home page:
    // the error the probe was answered with was never stored under its key.
    assertResponseStatus(blocked, 404, await describeResponse(blocked));
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertIdentical(await allowed.text(), "<h1>Home</h1>");
  });
});
