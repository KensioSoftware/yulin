import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertStringNotIncludes,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoHosted,
  simCognitoLocalUser,
  simCognitoLocalUsername,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoGetPage,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../test/cognito/managed-login-fixture.js";
import {
  simCognitoExchangedTokens,
  simCognitoHostedAddress,
  simCognitoPasskeyAsked,
  simCognitoPasskeyPosted,
  simCognitoPasskeyPresented,
  simCognitoPasskeySessionIn,
  simCognitoPasskeyUsernameIn,
  simCognitoWithHostedPasskey,
} from "../../../../test/cognito/hosted-passkey-fixture.js";

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
    const posted = await simCognitoPasskeyPosted(
      setUp,
      simCognitoLocalUsername,
    );
    const redirect = simCognitoRedirectedTo(posted);
    const code = redirect.searchParams.get("code");

    assertNonNullable(code);

    const tokens = await simCognitoExchangedTokens(setUp, code);

    // Then the browser went back to the application with a code, and the code
    // exchanged for the tokens a password sign-in would have earned.
    assertIdentical(redirect.searchParams.get("state"), "csrf-token");
    assertResponseStatus(posted, 302, await describeResponse(posted));
    assertTypeString(tokens["access_token"]);
    assertTypeString(tokens["id_token"]);
    assertIdentical(tokens["token_type"], "Bearer");
  });

  it("signs in by the address a pool signs its users in by", async () => {
    // Given a pool that signs its users in by email, allowing a passkey, with
    // a user holding one. The username that user holds is a UUID the pool
    // generated, and the address is all the browser knows it by.
    const setUp = await simCognitoWithHostedPasskey({
      usernameAttributes: ["email"],
      username: simCognitoHostedAddress,
    });

    // When the browser asks for the passkey and presents the credential,
    // posting back what the passkey page carried.
    const page = await simCognitoPasskeyAsked(setUp, simCognitoHostedAddress);
    const posted = await simCognitoPasskeyPresented(setUp, page);
    const code = simCognitoRedirectedTo(posted).searchParams.get("code");

    assertNonNullable(code);

    const tokens = await simCognitoExchangedTokens(setUp, code);

    // Then the page carried the address the person signed in by, and the
    // address resolved to the user the challenge was issued for, so the
    // sign-in finished and the code exchanged for tokens.
    assertIdentical(simCognitoPasskeyUsernameIn(page), simCognitoHostedAddress);
    assertResponseStatus(posted, 302, await describeResponse(posted));
    assertTypeString(tokens["access_token"]);
    assertTypeString(tokens["id_token"]);
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
    assertResponseStatus(asked, 200, await describeResponse(asked));
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
    const session = simCognitoPasskeySessionIn(await asked.text());
    const otherAsked = await simCognitoPostForm(other, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(other),
      username: simCognitoLocalUsername,
      passkey: "passkey",
    });
    const otherSession = simCognitoPasskeySessionIn(await otherAsked.text());

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
    assertResponseStatus(posted, 200, await describeResponse(posted));
    assertStringIncludes(
      await posted.text(),
      "challenge this user pool did not",
    );
  });
});
