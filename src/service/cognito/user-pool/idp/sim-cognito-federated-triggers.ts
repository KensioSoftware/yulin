import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoPreSignUpResponse } from "../trigger/sim-cognito-pre-sign-up-response.js";
import { SimCognitoTriggerOccasion } from "../trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";

interface SimCognitoFederatedTriggersProperties {
  readonly triggers: SimCognitoUserPoolTriggers;
}

interface SimCognitoFederatedTriggerContext {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
}

/**
 * The triggers a sign-in at an identity provider runs, in the order they run.
 *
 * AWS documents two sets. A subject the pool has never seen is signing up, and
 * runs `PreSignUp` and then `PostConfirmation`. A subject it already holds a
 * user for is authenticating, and runs `PreAuthentication` and then
 * `PostAuthentication`. Keeping the pair here rather than in the sign-in makes
 * the two sequences the whole of what this says.
 */
export class SimCognitoFederatedTriggers {
  private readonly triggers: SimCognitoUserPoolTriggers;

  constructor(properties: SimCognitoFederatedTriggersProperties) {
    this.triggers = properties.triggers;
  }

  /**
   * Run the trigger that guards a first sign-in, and answer with what its
   * handler asked for.
   *
   * It runs on a user the pool has yet to be given, so a handler that throws
   * leaves the pool without it.
   */
  async beforeSignUp(
    context: SimCognitoFederatedTriggerContext,
  ): Promise<SimCognitoPreSignUpResponse> {
    return this.triggers.preSignUp(
      SimCognitoTriggerOccasion.externalProviderSignUp,
      context,
    );
  }

  /**
   * Run the trigger that follows a first sign-in, on the user the pool now
   * holds.
   *
   * The source is the one a local confirmation reports, so an application
   * writing its own user record from that handler writes one for a federated
   * user without adding anything.
   */
  async afterSignUp(context: SimCognitoFederatedTriggerContext): Promise<void> {
    await this.triggers.postConfirmation(
      SimCognitoTriggerOccasion.confirmSignUp,
      context,
    );
  }

  /**
   * Run the trigger that guards a sign-in by a subject the pool already knows.
   */
  async beforeSignIn(
    context: SimCognitoFederatedTriggerContext,
  ): Promise<void> {
    await this.triggers.preAuthentication(context);
  }

  /**
   * Run the trigger that follows one.
   */
  async afterSignIn(context: SimCognitoFederatedTriggerContext): Promise<void> {
    await this.triggers.postAuthentication(context);
  }
}
