import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";

/**
 * The request a trigger is firing for.
 *
 * The app client is optional because the admin operations have none. Real
 * Cognito reports `CLIENT_ID_NOT_APPLICABLE` as the caller context's client id
 * for those, which is what a handler branching on the client sees.
 *
 * The user is the one the trigger is about. On the `PreSignUp` occasions it has
 * not been added to the pool yet, which is the point: a handler that throws
 * leaves the pool without it.
 */
export interface SimCognitoTriggerContext {
  readonly pool: SimCognitoUserPool;
  readonly user: SimCognitoUser;
  readonly client?: SimCognitoUserPoolClient | undefined;

  /**
   * The `ClientMetadata` the request carried.
   *
   * A sign-in's reaches `PreAuthentication` as its validation data and
   * `PostAuthentication` as its client metadata. A sign-up's reaches
   * `PreSignUp` and `PostConfirmation` as client metadata, alongside the
   * validation data below.
   */
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;

  /**
   * The `ValidationData` a sign-up or a user creation carried.
   *
   * Real Cognito never stores this on the user. It exists to be read by a
   * `PreSignUp` handler and goes no further.
   */
  readonly validationData?: Readonly<Record<string, string>> | undefined;
}
