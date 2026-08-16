/* oxlint-disable no-secrets/no-secrets -- the base32 alphabet below is a
 * constant of the encoding rather than anything secret. */
import { createHmac } from "node:crypto";

import {
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertStringLength,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoSignedIn,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";
import {
  SimCognitoEnableSoftwareTokenMfaException,
  SimCognitoInvalidParameterException,
  SimCognitoSoftwareTokenMfaNotFoundException,
} from "../../error/sim-cognito.error.js";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const secretCharacters = 32;

/**
 * The code an authenticator app would show for a secret, computed here rather
 * than read off the pool.
 *
 * This is what any TOTP library does with the `SecretCode`: decode the base32,
 * hash the thirty second step, and truncate. It is written out in the test so
 * that the secret being a real RFC 6238 shared secret is asserted rather than
 * assumed.
 */
function authenticatorCode(secretCode: string, at: Date): string {
  let bits = "";

  for (const character of secretCode) {
    bits += base32Alphabet.indexOf(character).toString(2).padStart(5, "0");
  }

  const bytes = bits.match(/.{8}/g) ?? [];
  const values = bytes.map((byte) => Number.parseInt(byte, 2));
  const secret = Uint8Array.from(values);
  const counter = Buffer.alloc(8);

  const step = Math.floor(at.getTime() / 1000 / 30);

  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const truncated = digest.readUInt32BE(offset) & 0x7f_ff_ff_ff;

  return String(truncated % 1_000_000).padStart(6, "0");
}

describe("sim Cognito software token registration", () => {
  it("registers the authenticator app holding the secret it issued", async () => {
    // Given a signed-in user with no second factor.
    const { cognito, userPoolId, accessToken } = await simCognitoSignedIn();

    // When it associates a software token and verifies the code its app shows.
    const associated = await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    assertTypeString(associated.SecretCode);
    assertStringLength(associated.SecretCode, secretCharacters);

    const shown = cognito
      .userPool(userPoolId)
      .softwareTokenCode(simCognitoUsername);
    const verified = await cognito.verifySoftwareToken(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: shown,
      }),
    );

    // Then the token is registered, which is what real Cognito answers.
    assertIdentical(verified.Status, "SUCCESS");
  });

  it("issues a secret an authenticator app can compute codes from", async () => {
    // Given a signed-in user that has been issued a shared secret.
    const { cognito, accessToken } = await simCognitoSignedIn();
    const associated = await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    assertTypeString(associated.SecretCode);

    // When the code is computed from that secret the way an authenticator app
    // computes one, rather than read off the pool.
    const computed = authenticatorCode(associated.SecretCode, new Date());
    const verified = await cognito.verifySoftwareToken(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: computed,
      }),
    );

    // Then it is the code the pool was expecting: the secret is a real one.
    assertIdentical(verified.Status, "SUCCESS");
  });

  it("refuses a code the secret does not produce", async () => {
    // Given a signed-in user that has been issued a shared secret.
    const { cognito, userPoolId, accessToken } = await simCognitoSignedIn();

    await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    // When it verifies a code from somewhere else.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.verifySoftwareToken(
        new VerifySoftwareTokenCommand({
          AccessToken: accessToken,
          UserCode: "000000",
        }),
      );
    });

    // Then it is refused as real Cognito refuses one, and the secret is still
    // there to try again with.
    assertInstanceOf(error, SimCognitoEnableSoftwareTokenMfaException);
    assertStringIncludes(error.message, "Code mismatch");

    const shown = cognito
      .userPool(userPoolId)
      .softwareTokenCode(simCognitoUsername);
    const verified = await cognito.verifySoftwareToken(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: shown,
      }),
    );

    assertIdentical(verified.Status, "SUCCESS");
  });

  it("refuses verifying a token that was never associated", async () => {
    // Given a signed-in user that has asked for no secret.
    const { cognito, accessToken } = await simCognitoSignedIn();

    // When it verifies a code anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.verifySoftwareToken(
        new VerifySoftwareTokenCommand({
          AccessToken: accessToken,
          UserCode: "123456",
        }),
      );
    });

    // Then it is told there is nothing to verify against.
    assertInstanceOf(error, SimCognitoSoftwareTokenMfaNotFoundException);
    assertStringIncludes(error.message, "AssociateSoftwareToken");
  });

  it("forgets the secret it issued when another is asked for", async () => {
    // Given a user part way through registering an app, which asks for another
    // secret because the first one never reached the app.
    const { cognito, accessToken } = await simCognitoSignedIn();
    const abandoned = await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    const abandonedSecret = abandoned.SecretCode;

    assertTypeString(abandonedSecret);

    await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    // When a code from the abandoned secret is verified.
    const fromAbandoned = authenticatorCode(abandonedSecret, new Date());
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.verifySoftwareToken(
        new VerifySoftwareTokenCommand({
          AccessToken: accessToken,
          UserCode: fromAbandoned,
        }),
      );
    });

    // Then it is refused: the user has one secret rather than two.
    assertInstanceOf(error, SimCognitoEnableSoftwareTokenMfaException);
  });

  it("refuses registering a token part way through a challenge", async () => {
    // Given a signed-in user.
    const { cognito, accessToken } = await simCognitoSignedIn();

    // When it registers a token against a challenge session, which is how real
    // Cognito registers one during MFA_SETUP.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.associateSoftwareToken(
        new AssociateSoftwareTokenCommand({
          AccessToken: accessToken,
          Session: "a-session-from-somewhere",
        }),
      );
    });

    // Then it is refused, because no challenge here issues such a session.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "MFA_SETUP");
  });

  it("refuses naming the device a token was registered on", async () => {
    // Given a signed-in user that has been issued a shared secret.
    const { cognito, userPoolId, accessToken } = await simCognitoSignedIn();

    await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    // When it names the app it registered, which real Cognito remembers as a
    // device.
    const shown = cognito
      .userPool(userPoolId)
      .softwareTokenCode(simCognitoUsername);
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.verifySoftwareToken(
        new VerifySoftwareTokenCommand({
          AccessToken: accessToken,
          UserCode: shown,
          FriendlyDeviceName: "Alice's phone",
        }),
      );
    });

    // Then it is refused rather than recorded against a device nothing here
    // tracks.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "FriendlyDeviceName");
  });
});
