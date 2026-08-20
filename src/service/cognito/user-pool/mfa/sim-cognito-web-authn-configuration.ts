import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * How a pool registers passkeys, in the shape `SetUserPoolMfaConfig` and
 * `GetUserPoolMfaConfig` carry it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html
 */
export interface SimCognitoWebAuthnConfigurationType {
  readonly RelyingPartyId?: string | undefined;
  readonly UserVerification?: string | undefined;
}

export type SimCognitoWebAuthnUserVerification = "required" | "preferred";

const userVerificationValues: readonly SimCognitoWebAuthnUserVerification[] = [
  "required",
  "preferred",
];

/**
 * The passkey configuration of one simulated user pool.
 *
 * Two values, both of which decide what a passkey means rather than how a
 * sign-in runs. The relying party ID is the name a passkey is registered
 * against, and it authenticates for that name and the hosts under it. The user
 * verification preference decides whether an authenticator that checks nobody
 * may register at all, and `required` is what makes a passkey count towards
 * MFA on real Cognito.
 *
 * They arrive through `SetUserPoolMfaConfig` rather than `CreateUserPool`,
 * which is why an `AWS::Cognito::UserPool` Resource carrying
 * `WebAuthnRelyingPartyID` is deployed in two calls here as it is on real
 * CloudFormation.
 *
 * Recorded and reported. No passkey is registered or presented in this
 * simulation, because both go through the `USER_AUTH` flow that
 * `SimCognitoAuthFlows` refuses by name.
 */
export class SimCognitoWebAuthnConfiguration {
  public readonly relyingPartyId: string | undefined;
  public readonly userVerification:
    | SimCognitoWebAuthnUserVerification
    | undefined;

  constructor(configuration: SimCognitoWebAuthnConfigurationType) {
    this.relyingPartyId = configuration.RelyingPartyId;
    this.userVerification = SimCognitoWebAuthnConfiguration.verificationIn(
      configuration.UserVerification,
    );
  }

  private static verificationIn(
    requested: string | undefined,
  ): SimCognitoWebAuthnUserVerification | undefined {
    if (requested === undefined) {
      return undefined;
    }

    if (
      !userVerificationValues.includes(
        requested as SimCognitoWebAuthnUserVerification,
      )
    ) {
      throw new SimCognitoInvalidParameterException(
        `WebAuthnConfiguration UserVerification '${requested}' is not a ` +
          `Cognito user verification preference: use one of ${userVerificationValues.join(
            " or ",
          )}`,
      );
    }

    return requested as SimCognitoWebAuthnUserVerification;
  }

  /**
   * The configuration as `GetUserPoolMfaConfig` reports it.
   */
  toOutput(): SimCognitoWebAuthnConfigurationType {
    return {
      ...(this.relyingPartyId !== undefined && {
        RelyingPartyId: this.relyingPartyId,
      }),
      ...(this.userVerification !== undefined && {
        UserVerification: this.userVerification,
      }),
    };
  }
}
