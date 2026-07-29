import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The setting that leaks whether a username exists, which is the API default.
 */
const legacy = "LEGACY";

/**
 * The setting that hides it, which the console applies to a new app client.
 */
const enabled = "ENABLED";

const settings: readonly string[] = [legacy, enabled];

/**
 * Whether an app client hides that a username does not exist.
 *
 * Real Cognito answers a sign-in naming an unknown user with
 * `UserNotFoundException` under `LEGACY` and with the same
 * `NotAuthorizedException` a wrong password gets under `ENABLED`. Which one a
 * pool gives depends on this setting, so it is honoured rather than picked:
 * a test asserting the generic error against a client that actually leaks
 * existence is asserting the wrong thing.
 *
 * The API default is `LEGACY`, and a client created in the Cognito console
 * gets `ENABLED`, so a client created here without the setting behaves the way
 * a client created by an SDK call or a CloudFormation template does.
 */
export class SimCognitoPreventUserExistenceErrors {
  public readonly value: string;

  constructor(requested: string | undefined) {
    if (requested === undefined) {
      this.value = legacy;
      return;
    }

    if (!settings.includes(requested)) {
      throw new SimCognitoInvalidParameterException(
        `PreventUserExistenceErrors '${requested}' is not a Cognito setting: ` +
          `use one of ${settings.join(", ")}`,
      );
    }

    this.value = requested;
  }

  /**
   * Whether a sign-in naming an unknown user is refused as a wrong password
   * rather than reported missing.
   */
  get hidesUserExistence(): boolean {
    return this.value === enabled;
  }
}
