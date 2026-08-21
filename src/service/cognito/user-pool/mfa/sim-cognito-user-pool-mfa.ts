import {
  requireSimCognitoVerificationWording,
  simCognitoLongestSmsMessage,
} from "../message/sim-cognito-verification-wording.js";
import { SimCognitoMfaConfiguration } from "./sim-cognito-mfa-configuration.js";
import {
  SimCognitoWebAuthnConfiguration,
  type SimCognitoWebAuthnConfigurationType,
} from "./sim-cognito-web-authn-configuration.js";

/**
 * Whether a pool offers a time-based one-time password as a second factor.
 */
export interface SimCognitoSoftwareTokenMfaConfigType {
  readonly Enabled?: boolean | undefined;
}

/**
 * What a pool says in the text message carrying a second factor.
 *
 * Real Cognito also takes an `SmsConfiguration` here, naming the IAM role it
 * assumes to call SNS. Nothing here delivers a message, and `CreateUserPool`
 * refuses the pool's own `SmsConfiguration` for that reason, so the command
 * refuses this one in the same words rather than recording a role it would
 * never assume.
 */
export interface SimCognitoSmsMfaConfigType {
  readonly SmsAuthenticationMessage?: string | undefined;
  readonly SmsConfiguration?: object | undefined;
}

/**
 * The MFA configuration of a pool, in the shape `SetUserPoolMfaConfig` and
 * `GetUserPoolMfaConfig` carry it.
 *
 * Real Cognito carries one more factor configuration here, for the code sent
 * by email. That one needs the pool's `EmailConfiguration`, which
 * `CreateUserPool` refuses, so the command refuses it rather than reporting it
 * back.
 */
export interface SimCognitoUserPoolMfaType {
  readonly MfaConfiguration?: string | undefined;
  readonly SoftwareTokenMfaConfiguration?:
    | SimCognitoSoftwareTokenMfaConfigType
    | undefined;
  readonly SmsMfaConfiguration?: SimCognitoSmsMfaConfigType | undefined;

  /**
   * How the pool registers passkeys, which is the relying party ID they are
   * registered against and whether an authenticator has to check who is
   * holding it.
   *
   * It sits among the MFA settings because that is where real Cognito puts
   * it, and a passkey with user verification is what counts towards MFA
   * there.
   */
  readonly WebAuthnConfiguration?:
    | SimCognitoWebAuthnConfigurationType
    | undefined;
}

/**
 * Whether a request asked for a time-based one-time password, and nothing
 * where it named no such factor at all.
 */
function softwareTokenIn(
  input: SimCognitoUserPoolMfaType,
): boolean | undefined {
  const requested = input.SoftwareTokenMfaConfiguration;

  if (requested === undefined) {
    return undefined;
  }

  return requested.Enabled ?? false;
}

/**
 * How a request asked for passkeys to be registered, and nothing where it
 * configured them at all.
 */
function webAuthnIn(
  input: SimCognitoUserPoolMfaType,
): SimCognitoWebAuthnConfiguration | undefined {
  const requested = input.WebAuthnConfiguration;

  if (requested === undefined) {
    return undefined;
  }

  return new SimCognitoWebAuthnConfiguration(requested);
}

/**
 * What a request asked for in a text message carrying a code, and nothing
 * where it configured no such factor at all.
 *
 * The wording is held to the rules real Cognito holds an SMS message to, so a
 * message that would reach a user with no code in it is refused here rather
 * than on the way to AWS.
 */
function smsIn(
  input: SimCognitoUserPoolMfaType,
): SimCognitoSmsMfaConfigType | undefined {
  const requested = input.SmsMfaConfiguration;

  if (requested === undefined) {
    return undefined;
  }

  const message = requested.SmsAuthenticationMessage;

  return {
    ...(message !== undefined && {
      SmsAuthenticationMessage: requireSimCognitoVerificationWording(
        "SmsAuthenticationMessage",
        message,
        simCognitoLongestSmsMessage,
      ),
    }),
  };
}

/**
 * The multi-factor authentication one simulated user pool is configured for:
 * whether it challenges, and which factors it offers.
 *
 * The two arrive separately on real Cognito. `CreateUserPool` and
 * `UpdateUserPool` carry the `MfaConfiguration` alone, and only
 * `SetUserPoolMfaConfig` says which factors a challenge could use, which is why
 * CloudFormation deploys a pool with MFA in two calls rather than one. That is
 * also why an update replaces the challenging and leaves the factors where they
 * were.
 *
 * A sign-in reads this to decide whether the user owes a second factor, and
 * `GetUserPoolMfaConfig` reports it. The factors it lists are what a pool
 * offers rather than what any one user registered: a challenge is issued for
 * the factor the user itself enabled.
 */
export class SimCognitoUserPoolMfa {
  #configuration: SimCognitoMfaConfiguration;

  /**
   * Whether a time-based one-time password is enabled, where a request said.
   * A pool no `SetUserPoolMfaConfig` request has reached has no answer to give
   * rather than a false one, which is what real Cognito reports for one.
   */
  #softwareToken: boolean | undefined;

  /**
   * What the pool would say in a text message carrying a code, where a request
   * configured the factor at all.
   */
  #sms: SimCognitoSmsMfaConfigType | undefined;

  /**
   * How the pool would register a passkey, where a request configured that at
   * all.
   */
  #webAuthn: SimCognitoWebAuthnConfiguration | undefined;

  constructor(configuration: SimCognitoMfaConfiguration) {
    this.#configuration = configuration;
  }

  /**
   * Whether the pool challenges, and which users it challenges.
   */
  get configuration(): SimCognitoMfaConfiguration {
    return this.#configuration;
  }

  /**
   * Replace the whole configuration, as `SetUserPoolMfaConfig` replaces it: a
   * factor the request leaves out goes back to being unconfigured.
   *
   * A request naming `SoftwareTokenMfaConfiguration` without an `Enabled` is
   * asking for it disabled, as real Cognito reads one.
   */
  set(input: SimCognitoUserPoolMfaType): void {
    this.#configuration = new SimCognitoMfaConfiguration(
      input.MfaConfiguration,
    );
    this.#softwareToken = softwareTokenIn(input);
    this.#sms = smsIn(input);
    this.#webAuthn = webAuthnIn(input);
  }

  /**
   * Whether the pool offers a second factor sent as a text message.
   */
  get sendsSms(): boolean {
    return this.#sms !== undefined;
  }

  /**
   * Take on the factors of the configuration this one replaces.
   *
   * An `UpdateUserPool` request names an `MfaConfiguration` and no factor
   * configuration at all, so an update changes whether the pool challenges and
   * leaves what it would challenge with alone, as it does on real Cognito.
   */
  keepFactorsOf(replaced: SimCognitoUserPoolMfa): void {
    this.#softwareToken = replaced.#softwareToken;
    this.#sms = replaced.#sms;
    this.#webAuthn = replaced.#webAuthn;
  }

  /**
   * How the pool registers passkeys, where a `SetUserPoolMfaConfig` request
   * said. A pool no such request has reached has no answer to give.
   */
  get webAuthn(): SimCognitoWebAuthnConfiguration | undefined {
    return this.#webAuthn;
  }

  /**
   * This configuration as `GetUserPoolMfaConfig` reports it.
   */
  toOutput(): SimCognitoUserPoolMfaType {
    return {
      MfaConfiguration: this.#configuration.value,
      ...(this.#softwareToken !== undefined && {
        SoftwareTokenMfaConfiguration: { Enabled: this.#softwareToken },
      }),
      ...(this.#sms !== undefined && { SmsMfaConfiguration: this.#sms }),
      ...(this.#webAuthn !== undefined && {
        WebAuthnConfiguration: this.#webAuthn.toOutput(),
      }),
    };
  }
}
