import type { SimCognitoClaimsOverride } from "../token/sim-cognito-claims-override.js";
import { SimCognitoClaimsOverrideReader } from "../token/sim-cognito-claims-override-reader.js";
import { SimCognitoPreSignUpResponse } from "./sim-cognito-pre-sign-up-response.js";
import type { SimCognitoTriggerContext } from "./sim-cognito-trigger-context.js";
import type { SimCognitoTriggerFunctions } from "./sim-cognito-trigger-functions.js";
import { SimCognitoTriggerInvocation } from "./sim-cognito-trigger-invocation.js";
import { SimCognitoTriggerOccasion } from "./sim-cognito-trigger-occasion.js";

interface SimCognitoUserPoolTriggersProperties {
  readonly functions: SimCognitoTriggerFunctions;
}

/**
 * Runs the Lambda triggers a simulated user pool names.
 *
 * One method per trigger, because each says something different about when it
 * fires and what the pool does with what the handler answered. Reaching the
 * function is the same for all of them, and lives in
 * `SimCognitoTriggerInvocation`.
 */
export class SimCognitoUserPoolTriggers {
  private readonly invocation: SimCognitoTriggerInvocation;
  private readonly claimsOverrides = new SimCognitoClaimsOverrideReader();

  constructor(properties: SimCognitoUserPoolTriggersProperties) {
    this.invocation = new SimCognitoTriggerInvocation(properties.functions);
  }

  /**
   * Run the `PreSignUp` trigger, if the pool has one, and read its answer.
   *
   * This runs before the user is added to the pool, so a handler that throws
   * refuses the sign-up and leaves the pool without it, which is what the
   * trigger is for.
   *
   * The answer is read on every occasion and acted on by the caller. Real
   * Cognito ignores all three flags when the occasion is `AdminCreateUser`,
   * because that user is already past confirmation, so that caller reads the
   * answer and does nothing with it.
   */
  async preSignUp(
    occasion: SimCognitoTriggerOccasion,
    context: SimCognitoTriggerContext,
  ): Promise<SimCognitoPreSignUpResponse> {
    return new SimCognitoPreSignUpResponse(
      await this.invocation.run(occasion, context),
    );
  }

  /**
   * Run the `PostConfirmation` trigger, if the pool has one.
   *
   * This runs once the user is `CONFIRMED`, so a handler that throws fails the
   * request without undoing the confirmation: the user stays confirmed, exactly
   * as on real Cognito. `AdminCreateUser` never reaches here, as it never
   * reaches it on real Cognito.
   */
  async postConfirmation(context: SimCognitoTriggerContext): Promise<void> {
    await this.invocation.run(SimCognitoTriggerOccasion.confirmSignUp, context);
  }

  /**
   * Run the `PreAuthentication` trigger, if the pool has one.
   *
   * A handler that throws refuses the sign-in, which is what the trigger is
   * for: the message it threw is carried into the
   * `UserLambdaValidationException` the caller sees.
   */
  async preAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.invocation.run(
      SimCognitoTriggerOccasion.preAuthentication,
      context,
    );
  }

  /**
   * Run the `PostAuthentication` trigger, if the pool has one.
   *
   * This runs once the tokens have been issued, so a handler that throws fails
   * the request without undoing the sign-in: the user is signed in, and the
   * tokens the pool issued stay issued, exactly as on real Cognito.
   */
  async postAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.invocation.run(
      SimCognitoTriggerOccasion.postAuthentication,
      context,
    );
  }

  /**
   * Run the `PreTokenGeneration` trigger, if the pool has one, and answer with
   * what its handler asked to change about the claims.
   *
   * A pool without the trigger, and a handler that returned the event without
   * writing a response, both answer with an override that changes nothing, so
   * the token layer applies one either way.
   */
  async preTokenGeneration(
    occasion: SimCognitoTriggerOccasion,
    context: SimCognitoTriggerContext,
  ): Promise<SimCognitoClaimsOverride> {
    return this.claimsOverrides.read(
      await this.invocation.run(occasion, context),
    );
  }
}
