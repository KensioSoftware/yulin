import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

/**
 * The user agent the rule below turns away.
 */
const scraperUserAgent = "scraper/1.0";

/**
 * A pool of its own with a web ACL in front of it that blocks the scraper.
 */
async function protectedPool(simAws: SimAws): Promise<string> {
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(created.UserPool?.Id);

  const waf = simAws.wafV2();
  const webAcl = await waf.createWebAcl(
    new CreateWebACLCommand({
      Name: "pool-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      VisibilityConfig: visibility,
      Rules: [
        {
          Name: "block-scraper",
          Priority: 0,
          Action: { Block: {} },
          Statement: {
            ByteMatchStatement: {
              FieldToMatch: { SingleHeader: { Name: "user-agent" } },
              PositionalConstraint: "CONTAINS",
              SearchString: Buffer.from("scraper"),
              TextTransformations: [{ Priority: 0, Type: "NONE" }],
            },
          },
          VisibilityConfig: { ...visibility, MetricName: "block-scraper" },
        },
      ],
    }),
  );

  await waf.associateWebAcl(
    new AssociateWebACLCommand({
      WebACLArn: webAcl.Summary?.ARN,
      ResourceArn: cognito.userPool(created.UserPool.Id).arn.value,
    }),
  );

  return created.UserPool.Id;
}

/**
 * Fetch one of the pool's endpoints as the scraper.
 */
async function fetchAsScraper(
  simAws: SimAws,
  userPoolId: string,
  path: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}${path}`,
    }).toString(),
    { headers: { "user-agent": scraperUserAgent } },
  );
}

describe("A web ACL in front of a sim Cognito user pool's documents", () => {
  it("blocks the JWKS and the OpenID configuration", async () => {
    // Given a pool with a web ACL in front of it.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await protectedPool(simAws);

    // When the scraper reads the two documents the pool publishes.
    const jwks = await fetchAsScraper(
      simAws,
      userPoolId,
      "/.well-known/jwks.json",
    );
    const configuration = await fetchAsScraper(
      simAws,
      userPoolId,
      "/.well-known/openid-configuration",
    );

    // Then both are refused. They are user pool endpoints, and a web ACL on a
    // pool covers every endpoint the pool serves.
    assertIdentical(jwks.status, 403);
    assertIdentical(configuration.status, 403);
  });

  it("leaves the recorded messages listing alone", async () => {
    // Given a pool with the same web ACL in front of it.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await protectedPool(simAws);

    // When the messages the pool would have sent are listed.
    const response = await fetchAsScraper(simAws, userPoolId, "/messages");

    // Then the listing is served. Real Cognito serves nothing at that path, so
    // no web ACL on AWS has an opinion about it, and it is Yulin's own view of
    // what a pool would have sent.
    assertIdentical(response.status, 200);
  });
});
