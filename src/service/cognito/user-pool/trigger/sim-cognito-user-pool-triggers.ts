import {
  SimCognitoUnexpectedLambdaException,
  SimCognitoUserLambdaValidationException,
} from "../../error/sim-cognito-trigger.error.js";
import type { SimCognitoClaimsOverride } from "../token/sim-cognito-claims-override.js";
import { SimCognitoClaimsOverrideReader } from "../token/sim-cognito-claims-override-reader.js";
import { SimCognitoPreSignUpResponse } from "./sim-cognito-pre-sign-up-response.js";
import type { SimCognitoTriggerContext } from "./sim-cognito-trigger-context.js";
import { SimCognitoTriggerEvent } from "./sim-cognito-trigger-event.js";
import type {
  SimCognitoTriggerFunctionRequest,
  SimCognitoTriggerFunctions,
} from "./sim-cognito-trigger-functions.js";
import { SimCognitoTriggerOccasion } from "./sim-cognito-trigger-occasion.js";
import { requireSimCognitoTriggerResponse } from "./sim-cognito-trigger-response.js";

interface SimCognitoUserPoolTriggersProperties {
  readonly functions: SimCognitoTriggerFunctions;
}

/**
 * Runs the Lambda triggers a simulated user pool names.
 *
 * A pool with no trigger for the occasion runs nothing, which is the ordinary
 * case and costs a map lookup. A pool with one invokes it and waits: these
 * triggers are synchronous, so the request is held up until the handler
 * answers, as it is on real Cognito.
 *
 * The function's resource policy is checked on every invocation rather than
 * remembered from the first, because a permission revoked afterwards stops the
 * trigger on real Cognito too.
 */
export class SimCognitoUserPoolTriggers {
  private readonly functions: SimCognitoTriggerFunctions;
  private readonly claimsOverrides = new SimCognitoClaimsOverrideReader();

  constructor(properties: SimCognitoUserPoolTriggersProperties) {
    this.functions = properties.functions;
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
    return new SimCognitoPreSignUpResponse(await this.run(occasion, context));
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
    await this.run(SimCognitoTriggerOccasion.confirmSignUp, context);
  }

  /**
   * Run the `PreAuthentication` trigger, if the pool has one.
   *
   * A handler that throws refuses the sign-in, which is what the trigger is
   * for: the message it threw is carried into the
   * `UserLambdaValidationException` the caller sees.
   */
  async preAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.run(SimCognitoTriggerOccasion.preAuthentication, context);
  }

  /**
   * Run the `PostAuthentication` trigger, if the pool has one.
   *
   * This runs once the tokens have been issued, so a handler that throws fails
   * the request without undoing the sign-in: the user is signed in, and the
   * tokens the pool issued stay issued, exactly as on real Cognito.
   */
  async postAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.run(SimCognitoTriggerOccasion.postAuthentication, context);
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
    return this.claimsOverrides.read(await this.run(occasion, context));
  }

  /**
   * Invoke the trigger for one occasion, answering with what the handler
   * returned, or with nothing where the pool has no such trigger.
   */
  private async run(
    occasion: SimCognitoTriggerOccasion,
    context: SimCognitoTriggerContext,
  ): Promise<unknown> {
    const { trigger } = occasion;
    const functionArn = context.pool.settings.lambdaConfig.find(trigger);

    if (functionArn === undefined) {
      return undefined;
    }

    const request: SimCognitoTriggerFunctionRequest = {
      functionArn,
      userPoolArn: context.pool.arn.value,
      userPoolAccountId: context.pool.arn.accountId,
    };
    const refusal = this.functions.invokeRefusal(request);

    if (refusal !== undefined) {
      throw new SimCognitoUnexpectedLambdaException(
        `The ${trigger} trigger of user pool ${context.pool.id} could not be ` +
          `invoked. ${refusal}`,
      );
    }

    const returned = await this.invoke(occasion, request, context);

    requireSimCognitoTriggerResponse(trigger, returned);

    return returned;
  }

  /**
   * Invoke the handler, reporting a failure the way real Cognito reports one.
   *
   * The handler's own message is repeated because that is the whole mechanism a
   * `PreSignUp` or `PreAuthentication` trigger refuses a request with: it
   * throws, and the words it threw are what the caller is told.
   */
  private async invoke(
    occasion: SimCognitoTriggerOccasion,
    request: SimCognitoTriggerFunctionRequest,
    context: SimCognitoTriggerContext,
  ): Promise<unknown> {
    try {
      return await this.functions.invoke(
        request,
        new SimCognitoTriggerEvent(context).document(occasion),
      );
    } catch (error) {
      throw new SimCognitoUserLambdaValidationException(
        `${occasion.trigger} failed with error ${
          error instanceof Error ? error.message : String(error)
        }.`,
      );
    }
  }
}
