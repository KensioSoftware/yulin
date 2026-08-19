import type { SimCognitoUserPoolClientSettingsProperties } from "./client/sim-cognito-user-pool-client-settings.js";
import type { SimCognitoUserPoolSettingsInput } from "./sim-cognito-user-pool-settings.js";

/**
 * What a simulation says about a user pool it registers as already existing.
 */
export interface SimCognitoUserPoolRegistration {
  /**
   * The pool id the simulated pool takes, in the `<region>_<characters>` form
   * real Cognito allocates. The Region it names has to be the Region of the
   * simulated Cognito registering it.
   */
  readonly id: string;

  readonly name: string;

  /**
   * The rest of the pool's configuration, in the shape `CreateUserPool` sends
   * it. A registration that leaves it out gets the same defaults a creation
   * would have given the pool.
   */
  readonly settings?: SimCognitoUserPoolSettingsInput | undefined;
}

/**
 * What a simulation says about an app client it registers as already existing.
 */
export interface SimCognitoUserPoolClientRegistration {
  readonly userPoolId: string;

  /**
   * The client id the simulated app client takes, as real Cognito allocates
   * one.
   */
  readonly id: string;

  readonly name: string;

  readonly generateSecret?: boolean | undefined;

  /**
   * The rest of the client's configuration, in the shape
   * `CreateUserPoolClient` sends it. `ClientName` is left out of it, `name`
   * carrying that.
   */
  readonly settings?:
    | Omit<SimCognitoUserPoolClientSettingsProperties, "ClientName">
    | undefined;
}
