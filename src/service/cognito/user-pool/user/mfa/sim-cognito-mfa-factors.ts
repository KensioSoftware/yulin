import { SimCognitoInvalidParameterException } from "../../../error/sim-cognito.error.js";

/**
 * The second factor sent as a text message.
 */
export const simCognitoSmsMfa = "SMS_MFA";

/**
 * The second factor an authenticator app computes.
 */
export const simCognitoSoftwareTokenMfa = "SOFTWARE_TOKEN_MFA";

/**
 * What a request says about one of a user's factors.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SMSMfaSettingsType.html
 */
export interface SimCognitoMfaSettingsType {
  readonly Enabled?: boolean | undefined;
  readonly PreferredMfa?: boolean | undefined;
}

/**
 * The factor settings `SetUserMFAPreference` and `AdminSetUserMFAPreference`
 * carry.
 */
export interface SimCognitoMfaPreferenceType {
  readonly SMSMfaSettings?: SimCognitoMfaSettingsType | undefined;
  readonly SoftwareTokenMfaSettings?: SimCognitoMfaSettingsType | undefined;
}

/**
 * One factor of a request, paired with the name it is enabled under.
 */
export type SimCognitoRequestedFactor = readonly [
  string,
  SimCognitoMfaSettingsType | undefined,
];

/**
 * The factors a request names, in the order they are reported in.
 */
export function simCognitoRequestedFactors(
  requested: SimCognitoMfaPreferenceType,
): readonly SimCognitoRequestedFactor[] {
  return [
    [simCognitoSmsMfa, requested.SMSMfaSettings],
    [simCognitoSoftwareTokenMfa, requested.SoftwareTokenMfaSettings],
  ];
}

/**
 * Refuse a request preferring two factors, and one preferring a factor it is
 * not also enabling.
 *
 * A user has one preferred factor at most, which is what `PreferredMfaSetting`
 * reports, so a request naming two is refused rather than silently keeping
 * whichever was applied last.
 */
export function requireSimCognitoPreference(
  factors: readonly SimCognitoRequestedFactor[],
): void {
  const preferred = factors.filter(
    ([, settings]) => settings?.PreferredMfa === true,
  );

  if (preferred.length > 1) {
    throw new SimCognitoInvalidParameterException(
      `Only one MFA factor can be preferred: this request prefers ${preferred
        .map(([name]) => name)
        .join(" and ")}`,
    );
  }

  for (const [name, settings] of preferred) {
    if (settings?.Enabled !== true) {
      throw new SimCognitoInvalidParameterException(
        `${name} cannot be the preferred factor while it is not enabled: ` +
          `set Enabled as well as PreferredMfa`,
      );
    }
  }
}

/**
 * Refuse enabling a factor a user has nothing to be challenged with.
 *
 * A code has to be sent somewhere, and a software token has to be one the
 * user's app has been shown to hold. Real Cognito refuses both the same way.
 */
export function requireSimCognitoFactorAvailable(
  name: string,
  attributes: ReadonlyMap<string, string>,
  hasSoftwareToken: boolean,
): void {
  if (name === simCognitoSmsMfa && !attributes.has("phone_number")) {
    throw new SimCognitoInvalidParameterException(
      `${simCognitoSmsMfa} cannot be enabled for a user with no ` +
        `phone_number attribute: there is nowhere to send the code`,
    );
  }

  if (name === simCognitoSoftwareTokenMfa && !hasSoftwareToken) {
    throw new SimCognitoInvalidParameterException(
      `${simCognitoSoftwareTokenMfa} cannot be enabled for a user that has ` +
        `not verified a software token: call AssociateSoftwareToken and ` +
        `VerifySoftwareToken first`,
    );
  }
}
