import {
  AdminGetUserCommand,
  AdminSetUserMFAPreferenceCommand,
  AssociateSoftwareTokenCommand,
  GetUserCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCognitoSignedInSetUp } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  simCognitoSignedIn,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

const phoneNumber = "+441632960123";

/**
 * A signed-in user that has registered an authenticator app.
 */
async function withSoftwareToken(
  setUp: SimCognitoSignedInSetUp,
): Promise<SimCognitoSignedInSetUp> {
  const { cognito, userPoolId, accessToken } = setUp;

  await cognito.associateSoftwareToken(
    new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
  );
  await cognito.verifySoftwareToken(
    new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: cognito
        .userPool(userPoolId)
        .softwareTokenCode(simCognitoUsername),
    }),
  );

  return setUp;
}

describe("sim Cognito user MFA preference", () => {
  it("enables the software token a user registered", async () => {
    // Given a user that has registered an authenticator app.
    const { cognito, accessToken } = await withSoftwareToken(
      await simCognitoSignedIn(),
    );

    // When it turns the factor on and prefers it, which is the third step
    // Cognito's own documentation gives for setting one up.
    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // Then reading itself reports the factor and the preference.
    const user = await cognito.getUser(
      new GetUserCommand({ AccessToken: accessToken }),
    );

    assertArrayEquals(user.UserMFASettingList ?? [], ["SOFTWARE_TOKEN_MFA"]);
    assertIdentical(user.PreferredMfaSetting, "SOFTWARE_TOKEN_MFA");
  });

  it("reports a user's factors to an administrator", async () => {
    // Given a user whose registered authenticator app is turned on.
    const { cognito, userPoolId, accessToken } = await withSoftwareToken(
      await simCognitoSignedIn(),
    );

    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // When an administrator reads the user.
    const described = await cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoUsername,
      }),
    );

    // Then it reports the same factors.
    assertArrayEquals(described.UserMFASettingList ?? [], [
      "SOFTWARE_TOKEN_MFA",
    ]);
    assertIdentical(described.PreferredMfaSetting, "SOFTWARE_TOKEN_MFA");
  });

  it("reports nothing about MFA for a user that registered no factor", async () => {
    // Given a user that has registered nothing.
    const { cognito, userPoolId, accessToken } = await simCognitoSignedIn();

    // When it is read on both sides of the API.
    const user = await cognito.getUser(
      new GetUserCommand({ AccessToken: accessToken }),
    );
    const described = await cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoUsername,
      }),
    );

    // Then neither field is reported at all, rather than as an empty list.
    assertUndefined(user.UserMFASettingList);
    assertUndefined(user.PreferredMfaSetting);
    assertUndefined(described.UserMFASettingList);
    assertUndefined(described.PreferredMfaSetting);
  });

  it("refuses enabling a software token the user has not verified", async () => {
    // Given a user that has been issued a secret and never verified it.
    const { cognito, accessToken } = await simCognitoSignedIn();

    await cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    // When it turns the factor on.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserMFAPreference(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          SoftwareTokenMfaSettings: { Enabled: true },
        }),
      );
    });

    // Then it is refused: there is no registered token to challenge with.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "VerifySoftwareToken");
  });

  it("enables a text message factor for a user with a phone number", async () => {
    // Given a user with a phone number a code could be sent to.
    const { cognito, userPoolId } = await simCognitoSignedIn({
      attributes: [{ Name: "phone_number", Value: phoneNumber }],
    });

    // When an administrator turns the SMS factor on for it.
    await cognito.adminSetUserMFAPreference(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: simCognitoUsername,
        SMSMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // Then the user is enabled for it.
    const described = await cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoUsername,
      }),
    );

    assertArrayEquals(described.UserMFASettingList ?? [], ["SMS_MFA"]);
    assertIdentical(described.PreferredMfaSetting, "SMS_MFA");
  });

  it("refuses a text message factor for a user with nowhere to send it", async () => {
    // Given a user with no phone number.
    const { cognito, userPoolId } = await simCognitoSignedIn();

    // When an administrator turns the SMS factor on for it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminSetUserMFAPreference(
        new AdminSetUserMFAPreferenceCommand({
          UserPoolId: userPoolId,
          Username: simCognitoUsername,
          SMSMfaSettings: { Enabled: true },
        }),
      );
    });

    // Then it is refused, saying why.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "phone_number");
  });

  it("leaves a factor the request says nothing about alone", async () => {
    // Given a user enabled for both factors.
    const setUp = await simCognitoSignedIn({
      attributes: [{ Name: "phone_number", Value: phoneNumber }],
    });
    const { cognito, userPoolId, accessToken } = await withSoftwareToken(setUp);

    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SMSMfaSettings: { Enabled: true, PreferredMfa: true },
        SoftwareTokenMfaSettings: { Enabled: true },
      }),
    );

    // When a later request turns the authenticator app off and says nothing
    // about SMS.
    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: false },
      }),
    );

    // Then the SMS factor is where it was, preference included.
    const described = await cognito.adminGetUser(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoUsername,
      }),
    );

    assertArrayEquals(described.UserMFASettingList ?? [], ["SMS_MFA"]);
    assertIdentical(described.PreferredMfaSetting, "SMS_MFA");
  });

  it("forgets the preference when the preferred factor is turned off", async () => {
    // Given a user whose authenticator app is its preferred factor.
    const { cognito, accessToken } = await withSoftwareToken(
      await simCognitoSignedIn(),
    );

    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // When the factor is turned off.
    await cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: false },
      }),
    );

    // Then the user prefers nothing, and is enabled for nothing.
    const user = await cognito.getUser(
      new GetUserCommand({ AccessToken: accessToken }),
    );

    assertUndefined(user.UserMFASettingList);
    assertUndefined(user.PreferredMfaSetting);
  });

  it("refuses preferring two factors at once", async () => {
    // Given a user that could be challenged either way.
    const setUp = await simCognitoSignedIn({
      attributes: [{ Name: "phone_number", Value: phoneNumber }],
    });
    const { cognito, accessToken } = await withSoftwareToken(setUp);

    // When both are preferred.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserMFAPreference(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          SMSMfaSettings: { Enabled: true, PreferredMfa: true },
          SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
        }),
      );
    });

    // Then it is refused: `PreferredMfaSetting` names one factor.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Only one MFA factor can be preferred");
  });

  it("refuses preferring a factor the request is not enabling", async () => {
    // Given a user that has registered an authenticator app.
    const { cognito, accessToken } = await withSoftwareToken(
      await simCognitoSignedIn(),
    );

    // When the factor is preferred without being enabled.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserMFAPreference(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          SoftwareTokenMfaSettings: { PreferredMfa: true },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "while it is not enabled");
  });

  it("refuses a second factor sent by email", async () => {
    // Given a signed-in user.
    const { cognito, accessToken } = await simCognitoSignedIn();

    // When it asks for the factor sent by email.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserMFAPreference(
        new SetUserMFAPreferenceCommand({
          AccessToken: accessToken,
          EmailMfaSettings: { Enabled: true },
        }),
      );
    });

    // Then it is refused, because no pool here has an EmailConfiguration to
    // send one with.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "EmailMfaSettings is not simulated");
  });
});
