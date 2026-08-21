import {
  AdminInitiateAuthCommand,
  CompleteWebAuthnRegistrationCommand,
  StartWebAuthnRegistrationCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoGetPage,
  simCognitoPageUrl,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../test/cognito/managed-login-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";

/**
 * A pool that allows a passkey at the first prompt, with a user holding one.
 *
 * The pool has a hosted domain and no `WebAuthnConfiguration`, so the passkey
 * is registered against the domain, which is what real Cognito falls back to.
 */
async function simCognitoWithHostedPasskey(): Promise<SimCognitoHostedSetUp> {
  const setUp = await simCognitoHosted();

  await simCognitoLocalUser(setUp);
  await setUp.cognito.updateUserPool(
    new UpdateUserPoolCommand({
      UserPoolId: setUp.userPoolId,
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    }),
  );

  const signedIn = await setUp.cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: setUp.userPoolId,
      ClientId: setUp.clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: simCognitoLocalUsername,
        PASSWORD: simCognitoLocalPassword,
      },
    }),
  );
  const AccessToken = signedIn.AuthenticationResult?.AccessToken;

  assertTypeString(AccessToken);

  await setUp.cognito.startWebAuthnRegistration(
    new StartWebAuthnRegistrationCommand({ AccessToken }),
  );
  await setUp.cognito.completeWebAuthnRegistration(
    new CompleteWebAuthnRegistrationCommand({
      AccessToken,
      Credential: setUp.cognito
        .userPool(setUp.userPoolId)
        .webAuthnCredential(simCognitoLocalUsername),
    }),
  );

  return setUp;
}

describe("Signing in with a passkey at sim Cognito managed login", () => {
  it("offers a passkey where the pool allows one", async () => {
    // Given a pool that allows a passkey and one that does not.
    const allowing = await simCognitoWithHostedPasskey();
    const password = await simCognitoHosted();

    // When a browser reaches the sign-in form at each.
    const offered = await simCognitoGetPage(
      allowing,
      "/oauth2/authorize",
      simCognitoAuthorizeParameters(allowing),
    );
    const withoutPasskey = await simCognitoGetPage(
      password,
      "/oauth2/authorize",
      simCognitoAuthorizeParameters(password),
    );

    // Then only the pool that allows one offers it.
    assertStringIncludes(await offered.text(), "Sign in with a passkey");
    assertStringNotIncludes(await withoutPasskey.text(), "passkey");
  });

  it("signs a user in with its passkey and exchanges the code", async () => {
    // Given a pool that allows a passkey, with a user holding one.
    const setUp = await simCognitoWithHostedPasskey();

    // When the browser posts the sign-in form with the passkey button.
    const posted = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });
    const redirect = simCognitoRedirectedTo(posted);
    const code = redirect.searchParams.get("code");

    assertNonNullable(code);

    const exchanged = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
      simCognitoPageUrl("/oauth2/token"),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: setUp.clientId,
          code,
          redirect_uri: simCognitoCallbackUrl,
        }).toString(),
      },
    );
    const tokens = (await exchanged.json()) as Record<string, unknown>;

    // Then the browser went back to the application with a code, and the code
    // exchanged for the tokens a password sign-in would have earned.
    assertIdentical(redirect.searchParams.get("state"), "csrf-token");
    assertIdentical(posted.status, 302);
    assertTypeString(tokens["access_token"]);
    assertTypeString(tokens["id_token"]);
    assertIdentical(tokens["token_type"], "Bearer");
  });

  it("shows the refusal on the form where the user has no passkey", async () => {
    // Given a pool that allows a passkey, with a user that has registered
    // none.
    const setUp = await simCognitoWithHostedPasskey();

    await simCognitoLocalUser(setUp, { username: "bob" });

    // When the browser presses the passkey button for that user.
    const posted = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: "bob",
      passkey: "passkey",
    });

    // Then the sign-in form comes back saying what is missing, which is where
    // real managed login puts a refusal the person can act on.
    assertStringIncludes(
      await posted.text(),
      "registered no passkey the challenge would accept",
    );
  });
});
