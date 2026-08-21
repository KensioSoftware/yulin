import { createHash } from "node:crypto";

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
  simCognitoPasskeyCredential,
  simCognitoRegisterPasskey,
  simCognitoRelyingPartyId,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import { simCognitoSignedIn } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
import {
  SimCognitoWebAuthnChallengeNotFoundException,
  SimCognitoWebAuthnConfigurationMissingException,
  SimCognitoWebAuthnCredentialNotSupportedException,
  SimCognitoWebAuthnOriginNotAllowedException,
  SimCognitoWebAuthnRelyingPartyMismatchException,
} from "../../error/sim-cognito-web-authn.error.js";
import type {
  SimCognitoWebAuthnCredentialDocument,
  SimCognitoWebAuthnDocumentValue,
} from "../../user-pool/user/web-authn/sim-cognito-web-authn-document.js";

/**
 * The authenticator data a credential would carry if it had been signed for
 * another domain, which is the hash of that domain and the same flags.
 */
function authenticatorDataFor(relyingPartyId: string): string {
  const flags = Buffer.alloc(5);

  flags.writeUInt8(0x05, 0);
  flags.writeUInt32BE(0, 1);

  return Buffer.concat([
    createHash("sha256").update(relyingPartyId).digest(),
    flags,
  ]).toString("base64url");
}

/**
 * A JSON value as a credential carries one, which is base64url of its bytes.
 */
function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * The client data a credential was signed over, read back as the JSON it is.
 */
function clientDataOf(
  credential: SimCognitoWebAuthnCredentialDocument,
): Record<string, unknown> {
  const encoded = credential.response.clientDataJSON;
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");

  return JSON.parse(decoded) as Record<string, unknown>;
}

/**
 * The credential a real authenticator made, with one member of it changed.
 */
function credentialWith(
  credential: SimCognitoWebAuthnCredentialDocument,
  response: Record<string, SimCognitoWebAuthnDocumentValue>,
): Record<string, SimCognitoWebAuthnDocumentValue> {
  return {
    ...credential,
    response: { ...credential.response, ...response },
  };
}

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

  it("refuses a credential collected at another origin", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const credential = simCognitoPasskeyCredential(setUp);
    const elsewhere = credentialWith(credential, {
      clientDataJSON: base64urlJson({
        ...clientDataOf(credential),
        origin: "https://phish.test",
      }),
    });

    // When a credential collected somewhere else is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: elsewhere,
        }),
      );
    });

    // Then the origin is not one the relying party covers.
    assertInstanceOf(error, SimCognitoWebAuthnOriginNotAllowedException);
    assertStringIncludes(error.message, simCognitoRelyingPartyId);
  });

  it("refuses a credential signed for another relying party", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const misdirected = credentialWith(simCognitoPasskeyCredential(setUp), {
      authenticatorData: authenticatorDataFor("elsewhere.example.com"),
    });

    // When a credential whose authenticator data names another domain is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: misdirected,
        }),
      );
    });

    // Then the relying party inside what was signed is not this pool's.
    assertInstanceOf(error, SimCognitoWebAuthnRelyingPartyMismatchException);
  });

  it("refuses a credential the pool cannot read a public key from", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const unusable = credentialWith(simCognitoPasskeyCredential(setUp), {
      publicKeyAlgorithm: -257,
    });

    // When a credential naming another algorithm is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: unusable,
        }),
      );
    });

    // Then the pool cannot use the key, and says which algorithm it asked for.
    assertInstanceOf(error, SimCognitoWebAuthnCredentialNotSupportedException);
    assertStringIncludes(error.message, "ECDSA over P-256");
  });

  it("refuses a credential that is not one a browser serialized", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    // When something else is sent as the credential.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: "a-passkey-honest",
        }),
      );
    });

    // Then it is refused for what it is rather than read as a credential.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "navigator.credentials");
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

  it("refuses a credential whose client data is not the JSON a browser collects", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const garbled = credentialWith(simCognitoPasskeyCredential(setUp), {
      clientDataJSON: Buffer.from("not json at all").toString("base64url"),
    });

    // When a credential carrying something else as its client data is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: garbled,
        }),
      );
    });

    // Then it is refused for what the client data is.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "response.clientDataJSON is not");
  });

  it("refuses a credential collected for the other half of the ceremony", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const credential = simCognitoPasskeyCredential(setUp);
    const presented = credentialWith(credential, {
      clientDataJSON: base64urlJson({
        ...clientDataOf(credential),
        type: "webauthn.get",
      }),
    });

    // When a credential presenting a passkey is sent to the registration.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: presented,
        }),
      );
    });

    // Then the ceremony it answers is the wrong one.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "rather than 'webauthn.create'");
  });

  it("refuses a credential with no authenticator data to read", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const bare = credentialWith(simCognitoPasskeyCredential(setUp), {
      authenticatorData: "",
    });

    // When a credential missing what the authenticator signed is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: bare,
        }),
      );
    });

    // Then it is refused for the member it is missing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "authenticatorData must be");
  });

  it("refuses a credential whose public key is not a key at all", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const unreadable = credentialWith(simCognitoPasskeyCredential(setUp), {
      publicKey: Buffer.from("not a key").toString("base64url"),
      transports: "internal",
    });

    // When a credential carrying something else as its public key is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: unreadable,
        }),
      );
    });

    // Then the pool has no key to check this passkey's signatures against.
    assertInstanceOf(error, SimCognitoWebAuthnCredentialNotSupportedException);
  });
});
