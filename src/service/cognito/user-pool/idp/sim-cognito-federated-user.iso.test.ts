import { AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import {
  simCognitoCallbackUrl,
  simCognitoDomainHost,
  simCognitoHosted,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import { SimCognitoExternalUser } from "./sim-cognito-external-user.js";

async function signIn(setUp: SimCognitoHostedSetUp): Promise<Response> {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    identity_provider: "Google",
  });

  return await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${simCognitoDomainHost}/oauth2/authorize?${parameters.toString()}`,
    }).toString(),
  );
}

describe("The user a sim Cognito pool creates for a federated sign-in", () => {
  it("is described with the identities attribute Cognito records", async () => {
    // Given a pool whose Google provider has signed a user in.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    await signIn(setUp);

    // When the user the pool created is described.
    const described = await setUp.cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: "Google_google-subject-1",
      }),
    );

    // Then it is in the status a federated user stays in, and its `identities`
    // attribute is the JSON string real Cognito reports.
    assertIdentical(described.UserStatus, "EXTERNAL_PROVIDER");

    const identities = described.UserAttributes?.find(
      (attribute) => attribute.Name === "identities",
    );
    assertNonNullable(identities?.Value);
    assertObjectMatches(JSON.parse(identities.Value), [
      {
        userId: "google-subject-1",
        providerName: "Google",
        providerType: "Google",
        primary: "true",
      },
    ]);
  });

  it("cannot sign in with the pool's own sign-in flows", async () => {
    // Given a pool whose Google provider has signed a user in.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    await signIn(setUp);

    // When that user is signed in with a password, which it has none of.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.adminInitiateAuth({
        input: {
          UserPoolId: setUp.userPoolId,
          ClientId: setUp.clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: {
            USERNAME: "Google_google-subject-1",
            PASSWORD: "whatever",
          },
        },
      });
    });

    // Then it is refused, as it is on real Cognito: a federated user's
    // password is at its provider rather than in the pool.
    assertStringIncludes(error.message, "Incorrect username or password.");
  });

  it("takes only the claims the attribute mapping named", async () => {
    // Given a provider mapping the email claim and nothing else, whose signed
    // in user carries more than that.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
      picture: "https://www.example.com/someone.png",
    });

    // When the user signs in.
    await signIn(setUp);

    // Then the unmapped claim is dropped, as it is on real Cognito, and the
    // mapped ones are set.
    const attributes = setUp.cognito
      .userPool(setUp.userPoolId)
      .requireUser("Google_google-subject-1" as never).attributeValues;
    assertIdentical(attributes.get("email"), "someone@example.com");
    assertUndefined(attributes.get("picture"));
  });

  it("needs a subject to be signed in as", () => {
    // Given an external user with no subject.
    // When it is put on a provider.
    const error = assertThrowsError(() => {
      // eslint-disable-next-line no-new -- the constructor is what refuses
      new SimCognitoExternalUser({ Subject: "" });
    });

    // Then it is refused, because the subject is what the pool builds the
    // federated username from.
    assertStringIncludes(error.message, "An external user needs a Subject");
  });

  it("stops signing in once the provider is signed out of", async () => {
    // Given a provider that has signed a user in.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    await signIn(setUp);

    // When the provider is signed out of.
    setUp.cognito
      .userPool(setUp.userPoolId)
      .auth.identityProviders.require("Google")
      .signOut();

    // Then a further authorize request asks who is signing in rather than
    // signing the same user in again.
    const response = await signIn(setUp);
    assertResponseStatus(response, 200, await describeResponse(response));
    assertStringIncludes(await response.text(), "Simulated Google sign-in");
  });
});
