import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
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

function hostedUrl(path: string, parameters: Record<string, string>): string {
  const query = new URLSearchParams(parameters).toString();

  return new SimAwsLocalUrl({
    input: `https://${simCognitoDomainHost}${path}?${query}`,
  }).toString();
}

/**
 * The parameters a well formed authorize request carries, which each test
 * changes one of.
 */
function authorizeParameters(
  setUp: SimCognitoHostedSetUp,
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    state: "csrf-token",
    identity_provider: "Google",
  };
}

async function authorize(
  setUp: SimCognitoHostedSetUp,
  parameters: Record<string, string>,
): Promise<Response> {
  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    hostedUrl("/oauth2/authorize", parameters),
  );
}

/**
 * The error a refusal redirected back to the application carries.
 */
function redirectedError(response: Response): URLSearchParams {
  const location = response.headers.get("location");
  assertNonNullable(location);

  return new URL(location).searchParams;
}

async function refusedBody(response: Response): Promise<string> {
  return JSON.stringify(await response.json());
}

describe("Refusals from a sim Cognito authorize endpoint", () => {
  it("answers in the browser when the request names no known client", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request names an app client the pool does not have.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      client_id: "not-a-client",
    });

    // Then the browser is told, rather than the error being sent to a redirect
    // URI nothing has vouched for.
    assertIdentical(response.status, 400);
    assertStringIncludes(
      await refusedBody(response),
      "is not an app client of user pool",
    );
  });

  it("answers in the browser when the redirect URI is not registered", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request asks to be sent somewhere else afterwards.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      redirect_uri: "https://www.example.net/callback",
    });

    // Then it is refused in the browser, because that URI is exactly what
    // cannot be trusted.
    assertIdentical(response.status, 400);
    assertStringIncludes(
      await refusedBody(response),
      "is not one of app client",
    );
  });

  it("sends a bad response type back to the application", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request asks for the implicit grant.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      response_type: "token",
    });

    // Then the error goes to the callback URL with the state, as real Cognito
    // sends one once the client and redirect URI are known to be good.
    assertIdentical(response.status, 302);
    const error = redirectedError(response);
    assertIdentical(error.get("error"), "unauthorized_client");
    assertIdentical(error.get("state"), "csrf-token");
    assertStringIncludes(
      error.get("error_description") ?? "",
      "the implicit grant, which is not simulated",
    );
  });

  it("sends an unknown response type back to the application", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request asks for a response type that is not one.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      response_type: "id_token",
    });

    // Then it is refused as an unsupported response type.
    assertIdentical(
      redirectedError(response).get("error"),
      "unsupported_response_type",
    );
  });

  it("refuses a scope the app client does not allow", async () => {
    // Given an app client allowing only `openid`.
    const setUp = await simCognitoHosted({ scopes: ["openid"] });

    // When an authorize request asks for another scope.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      scope: "openid profile",
    });

    // Then it is refused, rather than being granted less than it asked for.
    assertIdentical(redirectedError(response).get("error"), "invalid_scope");
  });

  it("refuses a PKCE challenge without the S256 method", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request carries a challenge and the plain method.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      code_challenge: "a-challenge",
      code_challenge_method: "plain",
    });

    // Then it is refused, because Cognito supports S256 alone.
    assertIdentical(redirectedError(response).get("error"), "invalid_request");
    assertStringIncludes(
      redirectedError(response).get("error_description") ?? "",
      "'S256' alone",
    );
  });

  it("refuses a request that would reach managed login", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();
    const { identity_provider: unused, ...withoutProvider } =
      authorizeParameters(setUp);

    // When an authorize request names no identity provider.
    const response = await authorize(setUp, withoutProvider);

    // Then it says so, rather than answering with a sign-in page this
    // simulation has no equivalent of.
    assertIdentical(response.status, 400);
    assertStringIncludes(
      await refusedBody(response),
      "This request would reach managed login",
    );
    assertIdentical(unused, "Google");
  });

  it("refuses an identity provider the pool does not have", async () => {
    // Given a pool with a domain.
    const setUp = await simCognitoHosted();

    // When an authorize request names another provider.
    const response = await authorize(setUp, {
      ...authorizeParameters(setUp),
      identity_provider: "Facebook",
    });

    // Then it is refused, naming the pool that has no such provider.
    assertStringIncludes(
      redirectedError(response).get("error_description") ?? "",
      "has no identity provider Facebook",
    );
  });

  it("refuses an identity provider the app client does not support", async () => {
    // Given an app client that supports only the pool's own users.
    const setUp = await simCognitoHosted({ identityProviders: ["COGNITO"] });

    // When an authorize request names the pool's Google provider.
    const response = await authorize(setUp, authorizeParameters(setUp));

    // Then it is refused, because a client signs in only through the providers
    // it lists.
    assertIdentical(
      redirectedError(response).get("error"),
      "unauthorized_client",
    );
  });

  it("refuses a provider with nobody signed in at it", async () => {
    // Given a pool whose Google provider has nobody signed in at it.
    const setUp = await simCognitoHosted();

    // When an authorize request tries to sign in through it.
    const response = await authorize(setUp, authorizeParameters(setUp));

    // Then it says what to do about it, rather than signing in a user nothing
    // put there.
    assertIdentical(response.status, 400);
    assertStringIncludes(
      await refusedBody(response),
      "Say who is signed in there with signInAs first",
    );
  });

  it("answers no other path and no other method", async () => {
    // Given a pool with a domain, with a user signed in at its provider.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {});
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When a path the domain does not serve is requested, and the authorize
    // endpoint is posted to.
    const missing = await http.fetch(hostedUrl("/oauth2/userInfo", {}));
    const posted = await http.fetch(
      hostedUrl("/oauth2/authorize", authorizeParameters(setUp)),
      { method: "POST" },
    );

    // Then each is refused, saying what the domain does serve.
    assertIdentical(missing.status, 404);
    assertStringIncludes(await refusedBody(missing), "/oauth2/authorize");
    assertIdentical(posted.status, 405);
    assertIdentical(posted.headers.get("allow"), "GET");
  });
});
