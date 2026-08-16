import {
  SimCognitoEnableSoftwareTokenMfaException,
  SimCognitoSoftwareTokenMfaNotFoundException,
} from "../../../error/sim-cognito.error.js";
import {
  requireSimCognitoFactorAvailable,
  requireSimCognitoPreference,
  simCognitoRequestedFactors,
  simCognitoSmsMfa,
  simCognitoSoftwareTokenMfa,
  type SimCognitoMfaPreferenceType,
  type SimCognitoRequestedFactor,
} from "./sim-cognito-mfa-factors.js";
import { SimCognitoSoftwareToken } from "./sim-cognito-software-token.js";

interface SimCognitoUserMfaProperties {
  /** The user's own attributes, which decide whether SMS is available to it. */
  readonly attributes: ReadonlyMap<string, string>;

  /** What to call when the user's factors change. */
  readonly changed: () => void;
}

/**
 * The second factors one simulated user has registered.
 *
 * This is what `AssociateSoftwareToken`, `VerifySoftwareToken` and the two MFA
 * preference operations change, what `AdminGetUser` and `GetUser` report as
 * `UserMFASettingList` and `PreferredMfaSetting`, and what a sign-in reads to
 * decide which challenge to answer with.
 *
 * A software token is registered in two steps, as real Cognito registers one:
 * a secret is associated, and a code computed from it shows that the user's
 * authenticator app holds the same secret. Verifying registers the token and
 * enables nothing. Enabling a factor is `SetUserMFAPreference`, which is the
 * third step the Cognito documentation gives for setting up a TOTP factor, and
 * whether real Cognito also activates one on verification alone was not
 * checked against a live account.
 *
 * A factor a request says nothing about is left as it was, so an application
 * enabling its authenticator app does not have to restate what it wants for
 * SMS.
 */
export class SimCognitoUserMfa {
  /** The secret associated and not yet verified, where there is one. */
  private associated: SimCognitoSoftwareToken | undefined;

  /** The secret the user's authenticator app has been shown to hold. */
  private registered: SimCognitoSoftwareToken | undefined;

  private readonly enabled = new Set<string>();

  private preference: string | undefined;

  private readonly attributes: ReadonlyMap<string, string>;

  /**
   * What to tell the user when its factors change, so its last modified date
   * moves on as it does for every other change to a user.
   */
  private readonly changed: () => void;

  constructor(properties: SimCognitoUserMfaProperties) {
    this.attributes = properties.attributes;
    this.changed = properties.changed;
  }

  /**
   * The registered software token, which is what a challenge would read a code
   * from.
   */
  get softwareToken(): SimCognitoSoftwareToken | undefined {
    return this.registered;
  }

  /**
   * The factors this user is enabled for, as `UserMFASettingList` reports
   * them.
   */
  get settings(): readonly string[] {
    return [simCognitoSmsMfa, simCognitoSoftwareTokenMfa].filter((name) =>
      this.enabled.has(name),
    );
  }

  /**
   * The factor a challenge would use, as `PreferredMfaSetting` reports it.
   */
  get preferred(): string | undefined {
    return this.preference;
  }

  /**
   * The factor a sign-in would be challenged for, and nothing where this user
   * has none to be challenged for.
   *
   * A user with one factor enabled is challenged for it whether or not it
   * named a preference, and a user with two is challenged for the one it
   * preferred. Real Cognito answers a user with two and no preference with
   * `SELECT_MFA_TYPE`, which is a challenge of its own, so there is nothing to
   * choose here and the caller says so.
   */
  get challengeFactor(): string | undefined {
    if (this.preference !== undefined) {
      return this.preference;
    }

    const enabled = this.settings;

    return enabled.length === 1 ? enabled[0] : undefined;
  }

  /**
   * The code this user's authenticator app is showing at a moment, for the
   * secret it was last given.
   *
   * The secret being registered wins over the registered one, because that is
   * the secret the app is holding once `AssociateSoftwareToken` has issued
   * another.
   */
  codeAt(now: Date): string | undefined {
    return (this.associated ?? this.registered)?.codeAt(now);
  }

  /**
   * Associate a fresh shared secret, and answer with the code to give the
   * user's authenticator app.
   *
   * A secret that was associated and never verified is forgotten, as real
   * Cognito forgets one: each call starts the registration again.
   */
  associate(): string {
    this.associated = SimCognitoSoftwareToken.issue();
    this.changed();

    return this.associated.secretCode;
  }

  /**
   * Verify the associated secret against a code the user's app computed.
   *
   * A wrong code leaves the secret associated, so the user can read the next
   * code off its app and try again.
   */
  verify(code: string | undefined, now: Date): void {
    const associated = this.associated;

    if (associated === undefined) {
      throw new SimCognitoSoftwareTokenMfaNotFoundException(
        "No software token has been associated with this user: call " +
          "AssociateSoftwareToken for a secret before verifying a code",
      );
    }

    if (!associated.matches(code, now)) {
      throw new SimCognitoEnableSoftwareTokenMfaException(
        "Code mismatch: the code does not match the software token secret " +
          "this user was given",
      );
    }

    this.registered = associated;
    this.associated = undefined;
    this.changed();
  }

  /**
   * Apply what a request says about this user's factors.
   */
  set(requested: SimCognitoMfaPreferenceType): void {
    const factors = simCognitoRequestedFactors(requested);

    requireSimCognitoPreference(factors);

    for (const [name, settings] of factors) {
      if (settings?.Enabled === true) {
        requireSimCognitoFactorAvailable(
          name,
          this.attributes,
          this.registered !== undefined,
        );
      }
    }

    for (const factor of factors) {
      this.apply(factor);
    }

    this.changed();
  }

  /**
   * Apply one factor's settings, leaving a factor the request said nothing
   * about as it was.
   */
  private apply([name, settings]: SimCognitoRequestedFactor): void {
    if (settings === undefined) {
      return;
    }

    if (settings.Enabled === true) {
      this.enabled.add(name);
    } else {
      this.enabled.delete(name);
    }

    if (settings.PreferredMfa === true) {
      this.preference = name;
    } else if (this.preference === name) {
      this.preference = undefined;
    }
  }
}
