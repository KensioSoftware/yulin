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
 * The challenge session the passkey page carries, out of its hidden input.
 */
function passkeySessionIn(page: string): string {
  const session = /name="passkey_session" value="([^"]+)"/u.exec(page)?.[1];

  assertTypeString(session);

  return session;
}

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

    // When the browser posts the sign-in form with the passkey button, and
    // presents the credential the page then asks for.
    const asked = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });
    const session = passkeySessionIn(await asked.text());
    const posted = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      passkey_session: session,
      credential: JSON.stringify(
        setUp.cognito.userPool(setUp.userPoolId).webAuthnAssertion(session),
      ),
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

    // Then the sign-in form comes back saying the passkey is not one this
    // user could present, which is where real managed login puts a refusal the
    // person can act on.
    assertStringIncludes(
      await posted.text(),
      "&#39;WEB_AUTHN&#39; is not available to this user",
    );
  });

  it("signs nobody in on the passkey button alone", async () => {
    // Given a pool that allows a passkey, with a user holding one.
    const setUp = await simCognitoWithHostedPasskey();

    // When a caller posts the username and the button, and nothing else.
    const asked = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });

    // Then it is asked for the passkey rather than signed in, so knowing a
    // username is not enough to reach the application with a code.
    assertIdentical(asked.status, 200);
    assertIdentical(asked.headers.get("location"), null);
    assertStringIncludes(await asked.text(), "Present your passkey");
  });

  it("refuses a credential another passkey signed", async () => {
    // Given two pools that allow passkeys, each with a user holding one.
    const setUp = await simCognitoWithHostedPasskey();
    const other = await simCognitoWithHostedPasskey();
    const parameters = simCognitoAuthorizeParameters(setUp);
    const asked = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });
    const session = passkeySessionIn(await asked.text());
    const otherAsked = await simCognitoPostForm(other, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(other),
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });
    const otherSession = passkeySessionIn(await otherAsked.text());

    // When the first pool is answered with the other user's credential.
    const posted = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      passkey_session: session,
      credential: JSON.stringify(
        other.cognito
          .userPool(other.userPoolId)
          .webAuthnAssertion(otherSession),
      ),
    });

    // Then the signature is what settles it, and the browser is answered with
    // the form rather than a code.
    assertIdentical(posted.status, 200);
    assertStringIncludes(
      await posted.text(),
      "challenge this user pool did not",
    );
  });
});
