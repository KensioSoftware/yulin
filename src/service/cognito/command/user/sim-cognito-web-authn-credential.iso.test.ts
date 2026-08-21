import { generateKeyPairSync } from "node:crypto";

import {
  CompleteWebAuthnRegistrationCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoAuthenticatorDataFor,
  simCognitoBase64urlJson,
  simCognitoClientDataOf,
  simCognitoCredentialWith,
  simCognitoPasskeyCredential,
  simCognitoRelyingPartyId,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  SimCognitoWebAuthnCredentialNotSupportedException,
  SimCognitoWebAuthnOriginNotAllowedException,
  SimCognitoWebAuthnRelyingPartyMismatchException,
} from "../../error/sim-cognito-web-authn.error.js";

/**
 * A credential arrives as the JSON a browser serializes a
 * `PublicKeyCredential` to, so a test can build one by hand. These are the
 * ones a real browser would never produce.
 */
describe("sim Cognito passkey credential refusals", () => {
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

  it("refuses a credential whose client data is not the JSON a browser collects", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const garbled = simCognitoCredentialWith(
      simCognitoPasskeyCredential(setUp),
      {
        clientDataJSON: Buffer.from("not json at all").toString("base64url"),
      },
    );

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
    const presented = simCognitoCredentialWith(credential, {
      clientDataJSON: simCognitoBase64urlJson({
        ...simCognitoClientDataOf(credential),
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

    const bare = simCognitoCredentialWith(simCognitoPasskeyCredential(setUp), {
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

  it("refuses a credential collected at another origin", async () => {
    // Given a user part way through a registration.
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

    const misdirected = simCognitoCredentialWith(
      simCognitoPasskeyCredential(setUp),
      {
        authenticatorData: simCognitoAuthenticatorDataFor(
          "elsewhere.example.com",
        ),
      },
    );

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

    const unusable = simCognitoCredentialWith(
      simCognitoPasskeyCredential(setUp),
      {
        publicKeyAlgorithm: -257,
      },
    );

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

  it("refuses a credential whose public key is not a key at all", async () => {
    // Given a user part way through a registration.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const unreadable = simCognitoCredentialWith(
      simCognitoPasskeyCredential(setUp),
      {
        publicKey: Buffer.from("not a key").toString("base64url"),
        transports: "internal",
      },
    );

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

  it("refuses a credential carrying a key of another kind", async () => {
    // Given a user part way through a registration, and an RSA key passed off
    // as the ECDSA one the registration asked for.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const wrongKind = simCognitoCredentialWith(
      simCognitoPasskeyCredential(setUp),
      {
        publicKey: rsa.publicKey
          .export({ format: "der", type: "spki" })
          .toString("base64url"),
      },
    );

    // When that credential is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.completeWebAuthnRegistration(
        new CompleteWebAuthnRegistrationCommand({
          AccessToken: setUp.accessToken,
          Credential: wrongKind,
        }),
      );
    });

    // Then the key itself is what the pool reads, and this is not one it can
    // use however the credential labels it.
    assertInstanceOf(error, SimCognitoWebAuthnCredentialNotSupportedException);
  });
});
