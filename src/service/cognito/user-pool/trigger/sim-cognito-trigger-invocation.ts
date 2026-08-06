import {
  SimCognitoUnexpectedLambdaException,
  SimCognitoUserLambdaValidationException,
} from "../../error/sim-cognito-trigger.error.js";
import type { SimCognitoTriggerContext } from "./sim-cognito-trigger-context.js";
import { SimCognitoTriggerEvent } from "./sim-cognito-trigger-event.js";
import type {
  SimCognitoTriggerFunctionRequest,
  SimCognitoTriggerFunctions,
} from "./sim-cognito-trigger-functions.js";
import type { SimCognitoTriggerOccasion } from "./sim-cognito-trigger-occasion.js";
import { requireSimCognitoTriggerResponse } from "./sim-cognito-trigger-response.js";

/**
 * Reaching the function a pool's trigger names.
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
export class SimCognitoTriggerInvocation {
  private readonly functions: SimCognitoTriggerFunctions;

  constructor(functions: SimCognitoTriggerFunctions) {
    this.functions = functions;
  }

  /**
   * Invoke the trigger for one occasion, answering with what the handler
   * returned, or with nothing where the pool has no such trigger.
   */
  async run(
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
