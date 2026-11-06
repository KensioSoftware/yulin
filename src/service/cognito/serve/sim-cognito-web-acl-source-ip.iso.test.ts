import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { simAwsSourceIpHeaderName } from "../../iam/request/sim-aws-source-ip-header.js";
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
 * Put the AWS anonymous IP list in front of the pool's hosted domain, and
 * declare a Tor exit range to be on it.
 */
async function protectFromTor(setUp: SimCognitoHostedSetUp): Promise<void> {
  const waf = setUp.simAws.wafV2();
  const created = await waf.createWebAcl(
    new CreateWebACLCommand({
      Name: "pool-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      VisibilityConfig: visibility,
      Rules: [
        {
          Name: "anonymous-ip",
          Priority: 0,
          OverrideAction: { None: {} },
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: "AWS",
              Name: "AWSManagedRulesAnonymousIpList",
            },
          },
          VisibilityConfig: { ...visibility, MetricName: "anonymous-ip" },
        },
      ],
    }),
  );

  await waf.associateWebAcl(
    new AssociateWebACLCommand({
      WebACLArn: created.Summary?.ARN,
      ResourceArn: setUp.cognito.userPool(setUp.userPoolId).arn.value,
    }),
  );

  waf.managedRules().onAddress("185.220.101.0/24", {
    matches: ["AnonymousIPList"],
  });
}

/**
 * One address inside the declared Tor exit range.
 */
const torExit = (): string => `185.220.101.${faker.number.int({ max: 255 })}`;

/**
 * Post the sign-up form from one client address.
 */
async function signUpFrom(
  setUp: SimCognitoHostedSetUp,
  sourceIp: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl("/signup"),
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        [simAwsSourceIpHeaderName]: sourceIp,
      },
      body: new URLSearchParams({
        ...simCognitoAuthorizeParameters(setUp),
        username: simCognitoLocalUsername,
        password: simCognitoLocalPassword,
      }).toString(),
    },
  );
}

/**
 * Fetch a hosted domain page from one client address.
 */
async function getFrom(
  setUp: SimCognitoHostedSetUp,
  path: string,
  sourceIp: string,
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl(path, simCognitoAuthorizeParameters(setUp)),
    { headers: { [simAwsSourceIpHeaderName]: sourceIp } },
  );
}

describe("The anonymous IP list in front of a sim Cognito hosted domain", () => {
  it("turns away a sign-up from a Tor exit before the pool creates the user", async () => {
    // Given a pool with the anonymous IP list in front of its hosted domain.
    const setUp = await simCognitoHosted();
    await protectFromTor(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the sign-up form is posted from a Tor exit.
    const response = await signUpFrom(setUp, torExit());

    // Then WAF blocks it, and nobody was signed up to be sent a code.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(pool.userCount, 0);
    assertUndefined(pool.findUser(simCognitoLocalUsername));
  });

  it("signs up the same form from an address on no list", async () => {
    // Given the same protected pool.
    const setUp = await simCognitoHosted();
    await protectFromTor(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the sign-up form is posted from an ordinary address.
    const response = await signUpFrom(
      setUp,
      faker.internet.ipv4({ network: "private-a" }),
    );

    // Then the endpoint runs and the user is in the pool.
    assertResponseStatus(response, 303, await describeResponse(response));
    assertNonNullable(pool.findUser(simCognitoLocalUsername));
  });

  it("turns away a Tor exit from the sign-in and password reset pages", async () => {
    // Given the protected pool.
    const setUp = await simCognitoHosted();
    await protectFromTor(setUp);
    const address = torExit();

    // When the pages a sign-up bot visits are fetched from a Tor exit.
    const signIn = await getFrom(setUp, "/oauth2/authorize", address);
    const forgot = await getFrom(setUp, "/forgotPassword", address);

    // Then each of them is blocked.
    assertResponseStatus(signIn, 403, await describeResponse(signIn));
    assertResponseStatus(forgot, 403, await describeResponse(forgot));
  });

  it("refuses a source address header that names no address", async () => {
    // Given the protected pool.
    const setUp = await simCognitoHosted();
    await protectFromTor(setUp);

    // When the sign-in page is fetched with a hostname in the header.
    const response = await getFrom(
      setUp,
      "/oauth2/authorize",
      "tor.example.test",
    );

    // Then the request is refused as a mistake in driving the simulation,
    // rather than served as though it came from loopback.
    assertResponseStatus(response, 400, await describeResponse(response));
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "InvalidRequestCaller",
    );
  });
});
