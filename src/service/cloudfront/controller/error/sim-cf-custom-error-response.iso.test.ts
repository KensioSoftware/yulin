import { describe, it } from "vitest";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";

describe("Sim CloudFront custom error responses", () => {
  it("serves the response page when the Origin has no such object", async () => {
    // Given a site mapping 403 and 404 to one error page, as a static site
    // behind CloudFront usually does.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "error-page-site", {
      "404.html": "<h1>Not found here</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("error-page-site", {
        CustomErrorResponses: {
          Quantity: 2,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
            {
              ErrorCode: 403,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
      }),
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the error page is served in place of the Origin's own 404.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Not found here</h1>");
  });

  it("returns the ResponseCode rather than the Origin's status", async () => {
    // Given a site answering a missing page with 200, as a single page app
    // handing routing to the browser does.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "spa-site", {
      "index.html": "<div id=app></div>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("spa-site", {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/index.html",
              ResponseCode: "200",
            },
          ],
        },
      }),
    );

    // When a client-side route is requested.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/orders/17",
    );

    // Then the app is served as a success.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<div id=app></div>");
  });

  it("leaves a status with no matching rule alone", async () => {
    // Given a rule for 403 only.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "unmatched-status-site", {
      "403.html": "<h1>Forbidden</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("unmatched-status-site", {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 403,
              ResponsePagePath: "/403.html",
              ResponseCode: "403",
            },
          ],
        },
      }),
    );

    // When a request produces a 404 instead.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the Origin's own response reaches the viewer untouched.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertStringIncludes(await response.text(), "not found in sim S3 Bucket");
  });

  it("leaves a successful response alone", async () => {
    // Given a site with a custom error response configured.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "success-site", {
      "index.html": "<h1>Home</h1>",
      "404.html": "<h1>Not found</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("success-site", {
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

    // When an object that exists is requested.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then it is served as it is.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("falls back to the response page's own status when it is missing", async () => {
    // Given a rule naming an error page that was never uploaded.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "missing-error-page-site", {});
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("missing-error-page-site", {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "200",
            },
          ],
        },
      }),
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the viewer gets the status from fetching the error page, not the
    // 200 the rule asks for, as in CloudFront.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertStringIncludes(await response.text(), "404.html");
  });

  it("fetches the response page through the Behavior matching its path", async () => {
    // Given error pages kept in a Bucket of their own, reached by a Cache
    // Behavior for their path.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "content-site", {});
    await simCfSiteBucket(simAws, "error-pages", {
      "errors/404.html": "<h1>From the error Bucket</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("content-site", {
        Origins: {
          Quantity: 2,
          Items: [
            {
              Id: "site-origin",
              DomainName: "content-site.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
            {
              Id: "errors-origin",
              DomainName: "error-pages.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        CacheBehaviors: {
          Quantity: 1,
          Items: [
            {
              PathPattern: "/errors/*",
              TargetOriginId: "errors-origin",
              ViewerProtocolPolicy: "allow-all",
            },
          ],
        },
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/errors/404.html",
              ResponseCode: "404",
            },
          ],
        },
      }),
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the error page came from the Origin its own Behavior names, not
    // from the Origin that failed.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>From the error Bucket</h1>");
  });

  it("serves the response page for a HEAD request without a body", async () => {
    // Given a site with an error page.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "head-error-site", {
      "404.html": "<h1>Not found</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("head-error-site", {
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

    // When a missing page is requested with HEAD.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/missing",
      { method: "HEAD" },
    );

    // Then the status is the custom one and no body comes with it.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "");
  });

  it("accepts a rule that only configures error caching", async () => {
    // Given a rule with no response page, which in CloudFront only sets how
    // long the error is cached. There is no simulated cache to apply it to.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "caching-only-site", {});
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("caching-only-site", {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [{ ErrorCode: 404, ErrorCachingMinTTL: 30 }],
        },
      }),
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the Origin's own response is what the viewer sees.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertStringIncludes(await response.text(), "not found in sim S3 Bucket");
  });
});
