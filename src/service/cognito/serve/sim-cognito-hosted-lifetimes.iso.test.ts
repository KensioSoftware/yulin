import { DescribeUserPoolDomainCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  simCognitoHosted,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";

function hostedUrl(path: string, query = ""): string {
  return new SimAwsLocalUrl({
    input: `https://${simCognitoDomainHost}${path}${query}`,
  }).toString();
}

async function exchange(
  setUp: SimCognitoHostedSetUp,
  code: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    hostedUrl("/oauth2/token"),
    {
      method: "POST",
      headers,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: setUp.clientId,
        code,
        redirect_uri: simCognitoCallbackUrl,
      }).toString(),
    },
  );
}

describe("How long a sim Cognito hosted grant lasts", () => {
  it("refuses a code that has run out", async () => {
    // Given an authorization code, which lasts the five minutes real Cognito
    // gives one.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);

    // When it is exchanged six minutes later.
    await setUp.simAws.clock().advanceBy({ minutes: 6 });
    const response = await exchange(setUp, code);

    // Then it is refused, as an expired code is on real Cognito.
    assertIdentical(response.status, 400);
    assertObjectMatches(await response.json(), { error: "invalid_grant" });
  });

  it("refuses a grant for a user the pool no longer holds", async () => {
    // Given an authorization code for a user that is then deleted.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);
    await setUp.cognito.adminDeleteUser({
      input: {
        UserPoolId: setUp.userPoolId,
        Username: "Google_google-subject-1",
      },
    });

    // When the code is exchanged.
    const response = await exchange(setUp, code);

    // Then the grant is refused, because there is nobody left to issue tokens
    // for.
    assertObjectMatches(await response.json(), { error: "invalid_grant" });
  });

  it("ignores a client authentication header it cannot read", async () => {
    // Given a public app client, which has no secret to present.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);

    // When the request carries an authorization header with no client id and
    // secret in it.
    const response = await exchange(setUp, code, {
      authorization: `Basic ${Buffer.from("no-separator").toString("base64")}`,
    });

    // Then the client id in the body is what the request is read as, so the
    // grant completes.
    assertIdentical(response.status, 200);
  });

  it("describes the security policy a custom domain was created with", async () => {
    // Given a pool on a custom domain.
    const setUp = await simCognitoHosted({ domain: "auth.example.com" });

    // When the domain is described.
    const described = await setUp.cognito.describeUserPoolDomain(
      new DescribeUserPoolDomainCommand({ Domain: "auth.example.com" }),
    );

    // Then the certificate it is served with comes back, and a CloudFront
    // distribution name, which a custom domain has and a prefix domain does
    // not.
    assertObjectMatches(described.DomainDescription?.CustomDomainConfig, {
      CertificateArn: "arn:aws:acm:us-east-1:888888888888:certificate/a1b2c3d4",
    });
    assertNonNullable(described.DomainDescription.CloudFrontDistribution);
  });
});
