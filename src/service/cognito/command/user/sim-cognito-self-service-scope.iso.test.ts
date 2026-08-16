import {
  AssociateSoftwareTokenCommand,
  GetUserCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  simCognitoHosted,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";

function hostedUrl(path: string, query = ""): string {
  return new SimAwsLocalUrl({
    input: `https://${simCognitoDomainHost}${path}${query}`,
  }).toString();
}

/**
 * The access token a hosted sign-in hands out, carrying the scopes the app
 * client was allowed and nothing else.
 */
async function hostedAccessToken(
  setUp: SimCognitoHostedSetUp,
): Promise<string> {
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
  const redirected = await http.fetch(
    hostedUrl("/oauth2/authorize", `?${parameters.toString()}`),
  );
  const location = redirected.headers.get("location");

  assertNonNullable(location);

  const code = new URL(location).searchParams.get("code");

  assertNonNullable(code);

  const exchanged = await http.fetch(hostedUrl("/oauth2/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    }).toString(),
  });
  const granted = (await exchanged.json()) as Record<string, string>;
  const accessToken = granted["access_token"];

  assertNonNullable(accessToken);

  return accessToken;
}

describe("sim Cognito self-service scope", () => {
  it("refuses a user operation from a sign-in without the scope for it", async () => {
    // Given a user signed in at the hosted domain of a client allowed the
    // openid and email scopes, which is the ordinary set for a sign-in.
    const setUp = await simCognitoHosted();
    const accessToken = await hostedAccessToken(setUp);

    // When that token registers an authenticator app and reads the user.
    const registering = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.associateSoftwareToken(
        new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
      );
    });
    const reading = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.getUser(
        new GetUserCommand({ AccessToken: accessToken }),
      );
    });
    const signingOut = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.globalSignOut(
        new GlobalSignOutCommand({ AccessToken: accessToken }),
      );
    });

    // Then each is refused, as real Cognito refuses an operation a user
    // performs on itself without aws.cognito.signin.user.admin.
    for (const error of [registering, reading, signingOut]) {
      assertInstanceOf(error, SimCognitoNotAuthorizedException);
      assertStringIncludes(error.message, "does not have required scopes");
    }
  });

  it("allows a user operation where the sign-in asked for the scope", async () => {
    // Given a client allowed the scope a self-service operation needs, and a
    // user signed in at its hosted domain.
    const setUp = await simCognitoHosted({
      scopes: ["openid", "email", "aws.cognito.signin.user.admin"],
    });
    const accessToken = await hostedAccessToken(setUp);

    // When that token reads the user.
    const user = await setUp.cognito.getUser(
      new GetUserCommand({ AccessToken: accessToken }),
    );

    // Then it is the federated user the sign-in created.
    assertNonNullable(user.Username);
  });
});
