import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
  type Rule,
} from "@aws-sdk/client-wafv2";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import {
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoPageUrl,
} from "../../../../test/cognito/managed-login-fixture.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

/**
 * The user agent the rules below turn away.
 */
const scraperUserAgent = "scraper/1.0";

/**
 * A rule blocking whatever sends the scraper's User-Agent header.
 */
const blockScraper: Rule = {
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
};

/**
 * Put a web ACL holding some rules in front of the pool's hosted domain.
 */
async function protect(
  setUp: SimCognitoHostedSetUp,
  rules: readonly Rule[],
): Promise<void> {
  const waf = setUp.simAws.wafV2();
  const created = await waf.createWebAcl(
    new CreateWebACLCommand({
      Name: "pool-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      VisibilityConfig: visibility,
      Rules: [...rules],
    }),
  );

  await waf.associateWebAcl(
    new AssociateWebACLCommand({
      WebACLArn: created.Summary?.ARN,
      ResourceArn: setUp.cognito.userPool(setUp.userPoolId).arn.value,
    }),
  );
}

/**
 * Fetch a hosted domain page, sending headers of the caller's choosing.
 */
async function get(
  setUp: SimCognitoHostedSetUp,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl(path, simCognitoAuthorizeParameters(setUp)),
    { headers },
  );
}

/**
 * Post a form to a hosted domain page, sending headers of the caller's choosing.
 */
async function post(
  setUp: SimCognitoHostedSetUp,
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl(path),
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
    },
  );
}

describe("A web ACL in front of a sim Cognito hosted domain", () => {
  it("blocks a request to the sign-in page and lets an allowed one through", async () => {
    // Given a pool whose hosted domain has a web ACL in front of it.
    const setUp = await simCognitoHosted();
    await protect(setUp, [blockScraper]);

    // When the sign-in page is fetched by the scraper and by a browser.
    const blocked = await get(setUp, "/oauth2/authorize", {
      "user-agent": scraperUserAgent,
    });
    const allowed = await get(setUp, "/oauth2/authorize");

    // Then the blocked request gets 403 with WAF's body, and the allowed one
    // gets the sign-in form the endpoint serves.
    assertResponseStatus(blocked, 403, await describeResponse(blocked));
    assertStringIncludes(await blocked.text(), "Request blocked by AWS WAF");
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertStringIncludes(await allowed.text(), 'name="username"');
  });

  it("blocks a sign-up before the endpoint creates the user", async () => {
    // Given a protected pool with nobody in it.
    const setUp = await simCognitoHosted();
    await protect(setUp, [blockScraper]);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the scraper posts the sign-up form.
    const blocked = await post(
      setUp,
      "/signup",
      {
        ...simCognitoAuthorizeParameters(setUp),
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      },
      { "user-agent": scraperUserAgent },
    );

    // Then it is turned away and the pool gained no user.
    assertResponseStatus(blocked, 403, await describeResponse(blocked));
    assertIdentical(pool.userCount, 0);
    assertUndefined(pool.findUser(simCognitoLocalUsername));
  });

  it("covers the token endpoint and the password reset pages too", async () => {
    // Given a protected pool.
    const setUp = await simCognitoHosted();
    await protect(setUp, [blockScraper]);
    const headers = { "user-agent": scraperUserAgent };

    // When the scraper reaches each of the other endpoints the domain serves.
    const token = await post(setUp, "/oauth2/token", {}, headers);
    const logout = await get(setUp, "/logout", headers);
    const forgot = await get(setUp, "/forgotPassword", headers);
    const reset = await get(setUp, "/confirmForgotPassword", headers);
    const confirm = await get(setUp, "/confirm", headers);

    // Then every one of them is blocked, because the web ACL is in front of
    // the domain rather than in front of one page of it.
    assertResponseStatus(token, 403, await describeResponse(token));
    assertResponseStatus(logout, 403, await describeResponse(logout));
    assertResponseStatus(forgot, 403, await describeResponse(forgot));
    assertResponseStatus(reset, 403, await describeResponse(reset));
    assertResponseStatus(confirm, 403, await describeResponse(confirm));
  });

  it("matches nothing on the body of a hosted domain request", async () => {
    // Given a pool protected by a rule inspecting the request body.
    const setUp = await simCognitoHosted();
    await protect(setUp, [
      {
        Name: "block-body",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { Body: { OversizeHandling: "CONTINUE" } },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from(simCognitoLocalUsername),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-body" },
      },
    ]);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When a sign-up carrying that username in its body is posted.
    const response = await post(setUp, "/signup", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the rule never sees it. Cognito forwards the headers and the path
    // of a managed login request to AWS WAF and none of its body, so the
    // sign-up runs and the user is in the pool.
    assertResponseStatus(response, 303, await describeResponse(response));
    assertNonNullable(pool.findUser(simCognitoLocalUsername));
  });

  it("serves a request an allow rule claimed with custom request handling", async () => {
    // Given a pool protected by an allow rule with custom request handling.
    const setUp = await simCognitoHosted();
    await protect(setUp, [
      {
        Name: "allow-browser",
        Priority: 0,
        Action: {
          Allow: {
            CustomRequestHandling: {
              InsertHeaders: [{ Name: "verified", Value: "yes" }],
            },
          },
        },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from("/oauth2/authorize"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "allow-browser" },
      },
    ]);

    // When the sign-in page is fetched.
    const response = await get(setUp, "/oauth2/authorize");

    // Then the endpoint answers the request the rule asked to be forwarded.
    // The header itself is asserted nowhere, because WAF prefixes an inserted
    // request header with `x-amzn-waf-` and no endpoint a pool serves reads
    // one. A REST API stage is where an inserted header is observable, since
    // the integration hands the headers to the function behind the method.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertStringIncludes(await response.text(), 'name="username"');
  });

  it("leaves a pool nothing is in front of serving as it did", async () => {
    // Given a pool with no web ACL associated with it.
    const setUp = await simCognitoHosted();

    // When the sign-in page is fetched by the scraper.
    const response = await get(setUp, "/oauth2/authorize", {
      "user-agent": scraperUserAgent,
    });

    // Then it is served, because nothing is there to turn it away.
    assertResponseStatus(response, 200, await describeResponse(response));
  });
});
