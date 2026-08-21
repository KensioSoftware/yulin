import {
  CompleteWebAuthnRegistrationCommand,
  DeleteWebAuthnCredentialCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoBase64urlJson,
  simCognitoClientDataOf,
  simCognitoCredentialWith,
  simCognitoPasskeyCredential,
  simCognitoRegisterPasskey,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import { simCognitoSignedIn } from "../../../../../test/cognito/signed-in-fixture.js";
import { SimCognitoResourceNotFoundException } from "../../error/sim-cognito.error.js";
import {
  SimCognitoWebAuthnChallengeNotFoundException,
  SimCognitoWebAuthnConfigurationMissingException,
} from "../../error/sim-cognito-web-authn.error.js";

describe("sim Cognito passkey registration refusals", () => {
  it("refuses a registration against a pool that names no relying party", async () => {
    // Given a signed-in user of a pool that was never configured for
    // passkeys.
    const setUp = await simCognitoSignedIn();

    // When it starts registering one.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.startWebAuthnRegistration(
        new StartWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
        }),
      );
    });

    // Then the pool has nothing to register the passkey against, and says
    // where the relying party comes from.
    assertInstanceOf(error, SimCognitoWebAuthnConfigurationMissingException);
    assertStringIncludes(error.message, "SetUserPoolMfaConfig");
    assertStringIncludes(error.message, "WebAuthnRelyingPartyID");
  });

  it("refuses a credential for a registration nobody started", async () => {
    // Given a user that has registered a passkey, spending the challenge it
    // was issued.
    const setUp = await simCognitoWithPasskeyPool();
    const credential = await simCognitoRegisterPasskey(setUp);

    // When the same credential is sent again.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: credential,
        }),
      );
    });

    // Then there is no registration in progress to complete.
    assertInstanceOf(error, SimCognitoWebAuthnChallengeNotFoundException);
    assertStringIncludes(error.message, "StartWebAuthnRegistration");
  });

  it("refuses a credential answering a challenge that was replaced", async () => {
    // Given a user part way through a registration, whose authenticator made a
    // credential for it.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const stale = simCognitoPasskeyCredential(setUp);

    // When another registration is started, and the first credential is sent.
    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: stale,
        }),
      );
    });

    // Then it answers a challenge the pool has already replaced.
    assertInstanceOf(error, SimCognitoWebAuthnChallengeNotFoundException);
  });

  it("spends the challenge on a refused credential", async () => {
    // Given a registration whose credential was refused for its origin.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const credential = simCognitoPasskeyCredential(setUp);
    const elsewhere = simCognitoCredentialWith(credential, {
      clientDataJSON: simCognitoBase64urlJson({
        ...simCognitoClientDataOf(credential),
        origin: "https://phish.test",
      }),
    });

    await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: elsewhere,
        }),
      );
    });

    // When the credential the authenticator really made is sent for the same
    // challenge.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: credential,
        }),
      );
    });

    // Then the challenge went with the refusal, and the registration has to be
    // started again.
    assertInstanceOf(error, SimCognitoWebAuthnChallengeNotFoundException);
  });

  it("refuses deleting a passkey the user does not have", async () => {
    // Given a user with one registered passkey.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);

    // When another credential id is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.deleteWebAuthnCredential(
        new DeleteWebAuthnCredentialCommand({
          AccessToken: setUp.accessToken,
          CredentialId: "not-a-credential-of-this-user",
        }),
      );
    });

    // Then the pool has no such passkey to forget.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });
});
