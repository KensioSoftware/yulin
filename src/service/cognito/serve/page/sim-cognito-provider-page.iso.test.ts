import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalUser,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import {
  simCognitoGetPage,
  simCognitoPostForm,
  simCognitoRedirectedTo,
} from "../../../../../test/cognito/managed-login-fixture.js";

/**
 * The parameters a browser following the "Sign in with Google" link arrives on.
 */
function federatedParameters(
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

/**
 * Follow the provider link and answer with the page it lands on.
 */
async function providerPage(setUp: SimCognitoHostedSetUp): Promise<string> {
  const response = await simCognitoGetPage(
    setUp,
    "/oauth2/authorize",
    federatedParameters(setUp),
  );

  assertIdentical(response.status, 200);

  return await response.text();
}

/**
 * The users the pool holds, by username.
 */
function usernamesIn(setUp: SimCognitoHostedSetUp): readonly string[] {
  return setUp.cognito
    .userPool(setUp.userPoolId)
    .users.map((user) => String(user.username));
}

describe("The page a sim Cognito domain stands in for an identity provider with", () => {
  it("answers an authorize request naming a provider nobody is signed in at", async () => {
    // Given a pool whose Google provider has nobody signed in at it.
    const setUp = await simCognitoHosted();

    // When a browser follows the provider link on the sign-in form.
    const page = await providerPage(setUp);

    // Then it is answered with a form rather than sent back to the
    // application with an error.
    assertStringIncludes(page, '<form method="post"');
    assertStringIncludes(page, 'name="subject"');
  });

  it("says it is Yulin standing in, in words nobody reads as the real service", async () => {
    // Given the same pool.
    const setUp = await simCognitoHosted();

    // When the page is served.
    const page = await providerPage(setUp);

    // Then it names Yulin and the provider it stands in for, so somebody
    // meeting it in a screenshot can tell no real sign-in happened.
    assertStringIncludes(page, "Simulated Google sign-in");
    assertStringIncludes(page, "This is Yulin standing in for Google");
    assertStringIncludes(page, "nothing on this page reaches it");
  });

  it("pre-fills the subject and the claims the attribute mapping reads", async () => {
    // Given a pool whose Google provider maps the email and given_name claims.
    const setUp = await simCognitoHosted();

    // When the page is served.
    const page = await providerPage(setUp);

    // Then a field per mapped claim arrives filled in, with an address on a
    // domain reserved for the purpose, so pressing the button is enough.
    assertStringIncludes(page, 'name="claim_email"');
    assertStringIncludes(page, 'value="someone@example.com"');
    assertStringIncludes(page, 'name="claim_given_name"');
    assertStringIncludes(page, 'value="simulated-google-subject"');

    // And a claim the mapping says nothing about is left off, because it would
    // reach no pool attribute.
    assertStringNotIncludes(page, 'name="claim_picture"');
  });

  it("signs a user in and reaches the callback when the page is posted unedited", async () => {
    // Given a pool whose Google provider has nobody signed in at it.
    const setUp = await simCognitoHosted();

    // When the page is posted with the values it arrived carrying.
    const posted = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...federatedParameters(setUp),
      subject: "simulated-google-subject",
      claim_email: "someone@example.com",
      claim_given_name: "Someone",
    });

    // Then the browser goes to the app client's callback URL with a code and
    // the state the application started with.
    assertIdentical(posted.status, 302);

    const callback = simCognitoRedirectedTo(posted);
    assertIdentical(callback.origin + callback.pathname, simCognitoCallbackUrl);
    assertNonNullable(callback.searchParams.get("code"));
    assertIdentical(callback.searchParams.get("state"), "csrf-token");

    // And the pool holds the federated user the subject names, carrying the
    // claims the page posted.
    const user = setUp.cognito
      .userPool(setUp.userPoolId)
      .requireUser("Google_simulated-google-subject" as never);
    assertIdentical(user.attributeValues.get("email"), "someone@example.com");
    assertIdentical(user.status.value, "EXTERNAL_PROVIDER");
  });

  it("takes an edited address, beside a local user already holding it", async () => {
    // Given a pool that already holds one of its own users at an address.
    const setUp = await simCognitoHosted();

    await simCognitoLocalUser(setUp, {
      username: "alice",
      attributes: [{ Name: "email", Value: "alice@example.com" }],
    });

    // When the page is posted with that same address edited into it.
    await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...federatedParameters(setUp),
      subject: "simulated-google-subject",
      claim_email: "alice@example.com",
      claim_given_name: "Someone",
    });

    // Then the pool holds two users at the one address, which is what real
    // Cognito keeps until something links them.
    assertArrayLength(usernamesIn(setUp), 2);

    const federated = setUp.cognito
      .userPool(setUp.userPoolId)
      .requireUser("Google_simulated-google-subject" as never);
    assertIdentical(
      federated.attributeValues.get("email"),
      "alice@example.com",
    );
  });

  it("is skipped where a provider already has somebody signed in at it", async () => {
    // Given a provider a test has said who is signed in at.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });

    // When the browser follows the provider link.
    const response = await simCognitoGetPage(
      setUp,
      "/oauth2/authorize",
      federatedParameters(setUp),
    );

    // Then the sign-in completes without the page being drawn, which is what
    // leaves every test written before this one unchanged.
    assertIdentical(response.status, 302);
    assertNonNullable(
      simCognitoRedirectedTo(response).searchParams.get("code"),
    );
    assertUndefined(
      setUp.cognito
        .userPool(setUp.userPoolId)
        .findUser("Google_simulated-google-subject"),
    );
  });

  it("asks again on the next request rather than remembering who was posted", async () => {
    // Given a page that has already been posted once.
    const setUp = await simCognitoHosted();

    await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...federatedParameters(setUp),
      subject: "simulated-google-subject",
      claim_email: "someone@example.com",
      claim_given_name: "Someone",
    });

    // When a further authorize request names the provider.
    const page = await providerPage(setUp);

    // Then it asks again, because real Cognito asks the provider afresh every
    // time and nothing here holds on to what a page posted.
    assertStringIncludes(page, "Simulated Google sign-in");
  });
});
