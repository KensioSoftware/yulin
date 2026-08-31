import {
  assertObjectMatches,
  assertResponseStatus,
  assertStringIncludes,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoDomainHost,
  simCognitoHosted,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";

function localUrl(input: string): string {
  return new SimAwsLocalUrl({ input }).toString();
}

async function openIdConfiguration(
  setUp: SimCognitoHostedSetUp,
): Promise<Record<string, string>> {
  const response = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    localUrl(
      `https://cognito-idp.eu-west-2.amazonaws.com/${setUp.userPoolId}/.well-known/openid-configuration`,
    ),
  );

  return (await response.json()) as Record<string, string>;
}

async function logout(
  setUp: SimCognitoHostedSetUp,
  parameters: Record<string, string>,
): Promise<Response> {
  const query = new URLSearchParams(parameters).toString();

  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    localUrl(`https://${simCognitoDomainHost}/logout?${query}`),
  );
}

describe("A sim Cognito pool with a hosted domain", () => {
  it("publishes its OAuth endpoints in the OpenID configuration", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When its OpenID configuration is fetched.
    const document = await openIdConfiguration(setUp);

    // Then the endpoints name the domain's own local hostname, which is where
    // a client discovering them can reach them.
    assertObjectMatches(document, {
      authorization_endpoint:
        "http://myapp-login.auth.eu-west-2.sim-aws.localhost/oauth2/authorize",
      token_endpoint:
        "http://myapp-login.auth.eu-west-2.sim-aws.localhost/oauth2/token",
      end_session_endpoint:
        "http://myapp-login.auth.eu-west-2.sim-aws.localhost/logout",
    });
  });

  it("publishes no OAuth endpoints before it has a domain", async () => {
    // Given a pool whose domain has been deleted.
    const setUp = await simCognitoHosted();
    await setUp.cognito.deleteUserPoolDomain({
      input: { UserPoolId: setUp.userPoolId, Domain: "myapp-login" },
    });

    // When its OpenID configuration is fetched.
    const document = await openIdConfiguration(setUp);

    // Then nothing is published there, because there is nothing to reach.
    assertUndefined(document["authorization_endpoint"]);
    assertUndefined(document["token_endpoint"]);
  });

  it("refuses a sign-out to a URL the app client did not register", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When a logout request names another URL.
    const response = await logout(setUp, {
      client_id: setUp.clientId,
      logout_uri: "https://www.example.net/",
    });

    // Then it is refused, rather than sending the browser wherever it asked.
    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(
      JSON.stringify(await response.json()),
      "is not one of app client",
    );
  });

  it("refuses a sign-out that would reach managed login", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When a logout request carries no sign-out URL, which on real Cognito
    // sends the user to sign in again.
    const response = await logout(setUp, { client_id: setUp.clientId });

    // Then it says so, because that page is not simulated.
    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(
      JSON.stringify(await response.json()),
      "logout_uri is required here",
    );
  });

  it("refuses a sign-out naming no app client", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When a logout request names no client at all.
    const response = await logout(setUp, {
      logout_uri: "https://www.example.com/",
    });

    // Then it is refused, because a sign-out URL means nothing without the
    // client that registered it.
    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(
      JSON.stringify(await response.json()),
      "is not an app client of user pool",
    );
  });
});
