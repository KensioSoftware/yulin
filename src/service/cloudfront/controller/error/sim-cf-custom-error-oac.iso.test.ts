import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCfOacCloudFrontReadStatement,
  simCfOacSiteDistributionArn,
  simCfOacSiteStack,
} from "../../../../../test/cloudfront/oac-site-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

const errorPage = "<h1>Not found</h1>";

/**
 * The rule a site behind an origin access control needs, and the reason it
 * needs it: the Bucket policy an origin access control is written with grants
 * `s3:GetObject` and nothing else, so a key the Bucket does not hold comes back
 * as 403 rather than 404. Mapping only 404 would leave a mistyped URL on
 * CloudFront's own error page.
 */
const mapForbiddenToErrorPage = [
  { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: "/404.html" },
];

/**
 * Serving a custom error page from a Bucket reached through an origin access
 * control.
 *
 * The error page is fetched as a request of its own, and it is fetched through
 * the Behavior that matches its path, so it is read as the same CloudFront
 * service principal an ordinary page is. Anything else would serve every page
 * of a private site and 403 on the one a mistyped URL reaches.
 */
describe("Sim CloudFront custom error responses behind an origin access control", () => {
  it("reads the error page as the Distribution the Bucket policy names", async () => {
    // Given a private site holding an error page, mapping the 403 a missing key
    // behind an origin access control comes back as onto it.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "always",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
      customErrorResponses: mapForbiddenToErrorPage,
      additionalObjects: { "404.html": errorPage },
    });

    // When a viewer asks for a page the Bucket does not hold, which the Origin
    // refuses rather than reporting absent.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/mistyped.html",
    );

    // Then the error page is served under the rule's status, which means the
    // read of it was signed for this Distribution as the ordinary read is.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), errorPage);
  });

  it("answers with the refusal where the Bucket holds no error page", async () => {
    // Given the same site with nothing at the error page's path.
    const { simAws, distributionId } = await simCfOacSiteStack({
      signingBehavior: "always",
      statement: simCfOacCloudFrontReadStatement(simCfOacSiteDistributionArn),
      customErrorResponses: mapForbiddenToErrorPage,
    });

    // When a viewer asks for a page the Bucket does not hold.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/mistyped.html",
    );

    // Then fetching the error page is refused in its turn, and that refusal is
    // what reaches the viewer, as it does in CloudFront. A Bucket the site's
    // build was never loaded into looks exactly like this.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "Access denied reading Object 404.html",
    );
  });
});
