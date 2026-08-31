import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoGetPage,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../test/cognito/managed-login-fixture.js";

const newPassword = "Ev3nBetter!";

/**
 * A pool that can send a reset code, holding one confirmed user.
 */
async function simCognitoResettable(
  preventUserExistenceErrors?: "ENABLED" | "LEGACY",
): Promise<SimCognitoHostedSetUp> {
  const setUp = await simCognitoHosted({
    autoVerifiedAttributes: ["email"],
    ...(preventUserExistenceErrors !== undefined && {
      preventUserExistenceErrors,
    }),
  });

  await simCognitoLocalUser(setUp);

  return setUp;
}

function resetCodeIn(setUp: SimCognitoHostedSetUp): string {
  const code = setUp.cognito
    .userPool(setUp.userPoolId)
    .confirmationCode(simCognitoLocalUsername);

  assertNonNullable(code);

  return code;
}

describe("Resetting a password through the pages a sim Cognito domain serves", () => {
  it("resets a forgotten password and signs in with the new one", async () => {
    // Given a user of the pool that has forgotten its password.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When the sign-in page is fetched, it offers the way out.
    const signInPage = await simCognitoGetPage(
      setUp,
      "/oauth2/authorize",
      parameters,
    );

    assertStringIncludes(await signInPage.text(), "/forgotPassword?");

    // And the forgotten password form is posted with the username.
    const asked = await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
    });

    // Then the browser is sent on to the page that takes the code.
    assertResponseStatus(asked, 303, await describeResponse(asked));
    assertIdentical(
      simCognitoRedirectedTo(asked).pathname,
      "/confirmForgotPassword",
    );

    // And posting the code the pool issued with a new password sets it.
    const reset = await simCognitoPostForm(setUp, "/confirmForgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
      code: resetCodeIn(setUp),
      password: newPassword,
    });

    assertResponseStatus(reset, 303, await describeResponse(reset));
    assertIdentical(
      simCognitoRedirectedTo(reset).pathname,
      "/oauth2/authorize",
    );

    // And that user then signs in with the new password and reaches the
    // callback with a code and the state the application began with.
    const signedIn = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: newPassword,
    });

    assertResponseStatus(signedIn, 302, await describeResponse(signedIn));

    const callback = simCognitoRedirectedTo(signedIn);

    assertNonNullable(callback.searchParams.get("code"));
    assertIdentical(callback.searchParams.get("state"), "csrf-token");
  });

  it("stops the old password working once the reset is through", async () => {
    // Given a user that has reset its password through the pages.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
    });
    await simCognitoPostForm(setUp, "/confirmForgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
      code: resetCodeIn(setUp),
      password: newPassword,
    });

    // When it signs in with the password it had before.
    const refused = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the sign-in form comes back saying so.
    assertResponseStatus(refused, 200, await describeResponse(refused));
    assertStringIncludes(
      await refused.text(),
      "Incorrect username or password",
    );
  });

  it("shows a wrong code on the form and changes no password", async () => {
    // Given a user waiting to answer with a reset code.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
    });

    // When the form is posted with a code the pool never issued.
    const refused = await simCognitoPostForm(setUp, "/confirmForgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
      code: "000000",
      password: newPassword,
    });

    // Then the form comes back with the refusal, and the old password still
    // signs the user in.
    assertResponseStatus(refused, 200, await describeResponse(refused));
    assertStringIncludes(await refused.text(), "Invalid verification code");

    const signedIn = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...parameters,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    assertResponseStatus(signedIn, 302, await describeResponse(signedIn));
  });

  it("shows a password the pool's policy turns down on the form", async () => {
    // Given a user waiting to answer with a reset code.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
    });

    // When the form is posted with a password the policy refuses.
    const refused = await simCognitoPostForm(setUp, "/confirmForgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
      code: resetCodeIn(setUp),
      password: "short",
    });

    // Then the form comes back with the rule the password broke.
    assertResponseStatus(refused, 200, await describeResponse(refused));
    assertStringIncludes(await refused.text(), "Password not long enough");
  });

  it("hides an unknown user where the app client asks it to", async () => {
    // Given an app client with PreventUserExistenceErrors enabled.
    const setUp = await simCognitoResettable("ENABLED");
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When the forgotten password form names a user the pool does not hold.
    const asked = await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: "mallory",
    });

    // Then the browser goes on to the code page, as it does for a user that
    // is really there.
    assertResponseStatus(asked, 303, await describeResponse(asked));
    assertIdentical(
      simCognitoRedirectedTo(asked).pathname,
      "/confirmForgotPassword",
    );
  });

  it("reports an unknown user where the app client leaks existence", async () => {
    // Given an app client left on the LEGACY default.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When the forgotten password form names a user the pool does not hold.
    const asked = await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: "mallory",
    });

    // Then the form comes back saying so, as real Cognito does under that
    // setting.
    assertResponseStatus(asked, 200, await describeResponse(asked));
    assertStringIncludes(await asked.text(), "User does not exist");
  });

  it("asks who has forgotten the password before anything is posted", async () => {
    // Given a pool with a hosted domain.
    const setUp = await simCognitoResettable();
    const parameters = simCognitoAuthorizeParameters(setUp);

    // When each of the two forms is fetched.
    const asking = await simCognitoGetPage(
      setUp,
      "/forgotPassword",
      parameters,
    );
    const resetting = await simCognitoGetPage(
      setUp,
      "/confirmForgotPassword",
      parameters,
    );

    // Then each asks for what it needs, and carries the grant's own state on
    // to the next step.
    const askingBody = await asking.text();

    assertResponseStatus(asking, 200, await describeResponse(asking));
    assertStringIncludes(askingBody, 'name="username"');
    assertStringIncludes(askingBody, 'value="csrf-token"');

    const resettingBody = await resetting.text();

    assertResponseStatus(resetting, 200, await describeResponse(resetting));
    assertStringIncludes(resettingBody, 'name="code"');
    assertStringIncludes(resettingBody, 'name="password"');
    assertStringIncludes(resettingBody, 'value="csrf-token"');
  });

  it("refuses a reset for a pool with nowhere to send a code", async () => {
    // Given a pool that verifies nothing, so it has no address to write to.
    const setUp = await simCognitoHosted();

    await simCognitoLocalUser(setUp);

    const parameters = simCognitoAuthorizeParameters(setUp);

    // When the forgotten password form is posted.
    const refused = await simCognitoPostForm(setUp, "/forgotPassword", {
      ...parameters,
      username: simCognitoLocalUsername,
    });

    // Then the form comes back with what real Cognito refuses this with.
    assertResponseStatus(refused, 200, await describeResponse(refused));
    assertStringIncludes(
      await refused.text(),
      "no registered/verified email or phone_number",
    );
  });
});
