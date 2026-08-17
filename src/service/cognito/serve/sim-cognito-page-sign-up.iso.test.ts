import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUsername,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoGetPage,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../test/cognito/managed-login-fixture.js";

describe("Signing up through the pages a sim Cognito domain serves", () => {
  it("signs up, confirms and then signs in, all through the pages", async () => {
    // Given a pool with a hosted domain and nobody in it.
    const setUp = await simCognitoHosted();
    const parameters = simCognitoAuthorizeParameters(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the sign-up form is fetched and posted.
    const form = await simCognitoGetPage(setUp, "/signup", parameters);
    assertIdentical(form.status, 200);
    assertStringIncludes(await form.text(), 'name="username"');

    const signedUp = await simCognitoPostForm(setUp, "/signup", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the user is in the pool unconfirmed, and the browser is sent on to
    // the page that asks for the code.
    assertIdentical(signedUp.status, 303);
    assertIdentical(simCognitoRedirectedTo(signedUp).pathname, "/confirm");
    assertTrue(
      pool.requireUser(simCognitoLocalUsername as never).status.isUnconfirmed,
    );

    // And posting the code the pool issued confirms the sign-up.
    const code = pool.confirmationCode(simCognitoLocalUsername);
    assertNonNullable(code);

    const confirmed = await simCognitoPostForm(setUp, "/confirm", {
      ...parameters,
      username: simCognitoLocalUsername,
      code,
    });

    assertIdentical(confirmed.status, 303);
    assertIdentical(
      simCognitoRedirectedTo(confirmed).pathname,
      "/oauth2/authorize",
    );

    // And that same user then signs in and reaches the callback with a code.
    const signedIn = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    assertIdentical(signedIn.status, 302);
    assertNonNullable(
      simCognitoRedirectedTo(signedIn).searchParams.get("code"),
    );
  });

  it("asks the pool for another confirmation code", async () => {
    // Given a user that signed itself up through the page.
    const setUp = await simCognitoHosted();
    const parameters = simCognitoAuthorizeParameters(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    await simCognitoPostForm(setUp, "/signup", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });
    const first = pool.confirmationCode(simCognitoLocalUsername);

    // When the resend button is pressed.
    const response = await simCognitoPostForm(setUp, "/confirm", {
      ...parameters,
      username: simCognitoLocalUsername,
      resend: "resend",
    });

    // Then the pool has issued a fresh code, and the page asks for it.
    assertIdentical(response.status, 200);
    assertStringIncludes(await response.text(), "Another code has been sent");

    const second = pool.confirmationCode(simCognitoLocalUsername);
    assertNonNullable(second);
    assertFalse(second === first);
  });

  it("shows a refused sign-up on the form", async () => {
    // Given a pool with the default password policy.
    const setUp = await simCognitoHosted();

    // When the sign-up form is posted with a password the policy turns down.
    const response = await simCognitoPostForm(setUp, "/signup", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      password: "short",
    });

    // Then the form comes back saying why, and the pool gained no user.
    assertIdentical(response.status, 200);
    assertStringIncludes(await response.text(), "Password did not conform");
    assertIdentical(setUp.cognito.userPool(setUp.userPoolId).userCount, 0);
  });

  it("asks a sign-up for the attributes the pool requires", async () => {
    // Given a pool that requires an email address of every user.
    const setUp = await simCognitoHosted({
      schema: [{ Name: "email", Required: true, AttributeDataType: "String" }],
    });
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When the sign-up form is fetched and posted with one.
    const form = await simCognitoGetPage(setUp, "/signup", parameters);
    assertStringIncludes(await form.text(), 'name="email"');

    const signedUp = await simCognitoPostForm(setUp, "/signup", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
      email: "someone@example.com",
    });

    // Then the user carries it.
    assertIdentical(signedUp.status, 303);
    assertIdentical(
      setUp.cognito
        .userPool(setUp.userPoolId)
        .requireUser(simCognitoLocalUsername as never)
        .attributeValues.get("email"),
      "someone@example.com",
    );
  });

  it("asks who is confirming when the page was reached from sign-in", async () => {
    // Given a browser that followed the confirmation link on the sign-in page,
    // which names nobody.
    const setUp = await simCognitoHosted();

    // When that page is fetched.
    const response = await simCognitoGetPage(
      setUp,
      "/confirm",
      simCognitoAuthorizeParameters(setUp),
    );

    // Then it asks for the username as well as the code, rather than holding
    // an empty one nothing can fill in.
    assertStringIncludes(await response.text(), 'id="username"');
  });
});
