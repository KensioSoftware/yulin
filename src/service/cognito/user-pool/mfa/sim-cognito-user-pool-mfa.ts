import { SimCognitoMfaConfiguration } from "./sim-cognito-mfa-configuration.js";

/**
 * Whether a pool offers a time-based one-time password as a second factor.
 */
export interface SimCognitoSoftwareTokenMfaConfigType {
  readonly Enabled?: boolean | undefined;
}

/**
 * The MFA configuration of a pool, in the shape `SetUserPoolMfaConfig` and
 * `GetUserPoolMfaConfig` carry it.
 *
 * Real Cognito carries two more factor configurations here, one for SMS and
 * one for email. Both need a delivery this simulation does not model, so both
 * are refused by the command rather than reported back.
 */
export interface SimCognitoUserPoolMfaType {
  readonly MfaConfiguration?: string | undefined;
  readonly SoftwareTokenMfaConfiguration?:
    | SimCognitoSoftwareTokenMfaConfigType
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
 * Nothing here challenges for a factor, so this is state a pool reports rather
 * than acts on. The one place it is read is a sign-in to a pool configured
 * `ON`, which real Cognito answers with a challenge and this simulation
 * refuses.
 */
export class SimCognitoUserPoolMfa {
  #configuration: SimCognitoMfaConfiguration;

  /**
   * Whether a time-based one-time password is enabled, where a request said.
   * A pool no `SetUserPoolMfaConfig` request has reached has no answer to give
   * rather than a false one, which is what real Cognito reports for one.
   */
  #softwareToken: boolean | undefined;

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
    };
  }
}
