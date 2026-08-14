import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  simCognitoHosted,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";

function hostedUrl(path: string, query = ""): string {
  return new SimAwsLocalUrl({
    input: `https://${simCognitoDomainHost}${path}${query}`,
  }).toString();
}

/**
 * The authorize URL an application builds to start a Google sign-in.
 */
function authorizeUrl(setUp: SimCognitoHostedSetUp): string {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    scope: "openid email",
    state: "csrf-token",
    identity_provider: "Google",
  });

  return hostedUrl("/oauth2/authorize", `?${parameters.toString()}`);
}

/**
 * The code an authorize request answered with, taken out of its redirect the
 * way the browser hands it to the application's callback.
 */
function codeIn(response: Response): string {
  const location = response.headers.get("location");
  assertNonNullable(location);

  const code = new URL(location).searchParams.get("code");
  assertNonNullable(code);

  return code;
}

async function exchangeCode(
  http: SimAwsHttp,
  setUp: SimCognitoHostedSetUp,
  code: string,
): Promise<Response> {
  return await http.fetch(hostedUrl("/oauth2/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    }).toString(),
  });
}

describe("Signing in through a sim Cognito hosted domain", () => {
  it("signs a federated user in and exchanges the code for tokens", async () => {
    // Given a pool with a domain, an app client and a Google provider that a
    // user is signed in at.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
      given_name: "Someone",
    });
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When the browser is sent to the authorize endpoint.
    const authorized = await http.fetch(authorizeUrl(setUp));

    // Then it is redirected back to the app client's callback URL with a code
    // and the state it was given.
    assertIdentical(authorized.status, 302);
    const location = new URL(authorized.headers.get("location") ?? "");
    assertIdentical(location.origin + location.pathname, simCognitoCallbackUrl);
    assertIdentical(location.searchParams.get("state"), "csrf-token");

    // And the application's own server exchanges that code for tokens.
    const exchanged = await exchangeCode(http, setUp, codeIn(authorized));
    assertIdentical(exchanged.status, 200);

    const tokens = (await exchanged.json()) as Record<string, string>;
    assertObjectMatches(tokens, { token_type: "Bearer", expires_in: 3600 });
    assertNonNullable(tokens["id_token"]);
    assertNonNullable(tokens["refresh_token"]);

    // And the id token verifies against the pool, naming the user the pool
    // created for the Google subject and the attributes the mapping named.
    const verifier = CognitoJwtVerifier.create({
      userPoolId: setUp.userPoolId,
      tokenUse: "id",
      clientId: setUp.clientId,
    });
    verifier.cacheJwks(setUp.cognito.userPool(setUp.userPoolId).jwks());

    const claims = await verifier.verify(tokens["id_token"]);
    assertIdentical(claims["cognito:username"], "Google_google-subject-1");
    assertIdentical(claims["email"], "someone@example.com");
    assertIdentical(claims["given_name"], "Someone");
    assertObjectMatches(claims.identities, [
      { userId: "google-subject-1", providerName: "Google", primary: "true" },
    ]);
  });

  it("signs the same user in again on a second sign-in", async () => {
    // Given a pool whose Google provider has already signed a user in.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    const http = new SimAwsHttp({ simAws: setUp.simAws });
    await http.fetch(authorizeUrl(setUp));

    // When the same subject signs in again with a changed email address.
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "moved@example.com",
    });
    await http.fetch(authorizeUrl(setUp));

    // Then the pool holds one user, with the mapped attribute updated, as real
    // Cognito updates a mapped attribute when the provider's value changes.
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    assertIdentical(pool.userCount, 1);
    assertIdentical(
      pool
        .requireUser("Google_google-subject-1" as never)
        .attributeValues.get("email"),
      "moved@example.com",
    );
  });

  it("refreshes tokens at the token endpoint", async () => {
    // Given a completed sign-in.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    const http = new SimAwsHttp({ simAws: setUp.simAws });
    const authorized = await http.fetch(authorizeUrl(setUp));
    const exchanged = await exchangeCode(http, setUp, codeIn(authorized));
    const tokens = (await exchanged.json()) as Record<string, string>;

    // When the refresh token is presented.
    const refreshed = await http.fetch(hostedUrl("/oauth2/token"), {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: setUp.clientId,
        refresh_token: tokens["refresh_token"] ?? "",
      }).toString(),
    });

    // Then fresh tokens come back, with no new refresh token, as none comes
    // back from real Cognito with refresh token rotation off.
    assertIdentical(refreshed.status, 200);
    const refreshedTokens = (await refreshed.json()) as Record<string, string>;
    assertNonNullable(refreshedTokens["access_token"]);
    assertNonNullable(refreshedTokens["id_token"]);
    assertUndefined(refreshedTokens["refresh_token"]);
  });

  it("signs out to a URL the app client registered", async () => {
    // Given a pool with a domain and an app client.
    const setUp = await simCognitoHosted();
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When the browser is sent to the logout endpoint.
    const response = await http.fetch(
      hostedUrl(
        "/logout",
        `?client_id=${setUp.clientId}&logout_uri=${encodeURIComponent("https://www.example.com/")}`,
      ),
    );

    // Then it is redirected to the sign-out URL.
    assertIdentical(response.status, 302);
    assertIdentical(
      response.headers.get("location"),
      "https://www.example.com/",
    );
  });

  it("answers on the real AWS hostname as well as the local one", async () => {
    // Given a pool with a prefix domain, with a user signed in at its
    // provider.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    const parameters = new URLSearchParams({
      response_type: "code",
      client_id: setUp.clientId,
      redirect_uri: simCognitoCallbackUrl,
      identity_provider: "Google",
    });

    // When the authorize endpoint is requested at the hostname an application
    // would build, rather than at the localhost one.
    const response = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
      `https://${simCognitoDomainHost}/oauth2/authorize?${parameters.toString()}`,
    );

    // Then the domain answers, so the URL under test is the URL in production.
    assertIdentical(response.status, 302);
    assertStringIncludes(
      response.headers.get("location") ?? "",
      simCognitoCallbackUrl,
    );
  });

  it("serves a custom domain on the hostname it was created with", async () => {
    // Given a pool served on a custom domain.
    const setUp = await simCognitoHosted({ domain: "auth.example.com" });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    const http = new SimAwsHttp({ simAws: setUp.simAws });
    const parameters = new URLSearchParams({
      response_type: "code",
      client_id: setUp.clientId,
      redirect_uri: simCognitoCallbackUrl,
      identity_provider: "Google",
    });

    // When the browser is sent to that hostname.
    const response = await http.fetch(
      new SimAwsLocalUrl({
        input: `https://auth.example.com/oauth2/authorize?${parameters.toString()}`,
      }).toString(),
    );

    // Then the domain answers, as it does on its Cognito hostname.
    assertIdentical(response.status, 302);
    assertStringIncludes(
      response.headers.get("location") ?? "",
      simCognitoCallbackUrl,
    );
  });
});
