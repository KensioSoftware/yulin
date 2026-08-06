import {
  SimCognitoUnexpectedLambdaException,
  SimCognitoUserLambdaValidationException,
} from "../../error/sim-cognito-trigger.error.js";
import {
  SimCognitoTriggerEvent,
  type SimCognitoTriggerContext,
} from "./sim-cognito-trigger-event.js";
import type {
  SimCognitoTriggerFunctionRequest,
  SimCognitoTriggerFunctions,
} from "./sim-cognito-trigger-functions.js";
import type { SimCognitoTriggerName } from "./sim-cognito-trigger-name.js";
import { requireSimCognitoTriggerResponse } from "./sim-cognito-trigger-response.js";

interface SimCognitoUserPoolTriggersProperties {
  readonly functions: SimCognitoTriggerFunctions;
}

/**
 * Runs the Lambda triggers a simulated user pool names.
 *
 * A pool with no trigger for the occasion runs nothing, which is the ordinary
 * case and costs a map lookup. A pool with one invokes it and waits: these
 * triggers are synchronous, so the sign-in is held up until the handler
 * answers, as it is on real Cognito.
 *
 * The function's resource policy is checked on every invocation rather than
 * remembered from the first, because a permission revoked afterwards stops the
 * trigger on real Cognito too.
 */
export class SimCognitoUserPoolTriggers {
  private readonly functions: SimCognitoTriggerFunctions;

  constructor(properties: SimCognitoUserPoolTriggersProperties) {
    this.functions = properties.functions;
  }

  /**
   * Run the `PreAuthentication` trigger, if the pool has one.
   *
   * A handler that throws refuses the sign-in, which is what the trigger is
   * for: the message it threw is carried into the
   * `UserLambdaValidationException` the caller sees.
   */
  async preAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.run("PreAuthentication", context);
  }

  /**
   * Run the `PostAuthentication` trigger, if the pool has one.
   *
   * This runs once the tokens have been issued, so a handler that throws fails
   * the request without undoing the sign-in: the user is signed in, and the
   * tokens the pool issued stay issued, exactly as on real Cognito.
   */
  async postAuthentication(context: SimCognitoTriggerContext): Promise<void> {
    await this.run("PostAuthentication", context);
  }

  private async run(
    trigger: SimCognitoTriggerName,
    context: SimCognitoTriggerContext,
  ): Promise<void> {
    const functionArn = context.pool.lambdaConfig.find(trigger);

    if (functionArn === undefined) {
      return;
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

    requireSimCognitoTriggerResponse(
      trigger,
      await this.invoke(trigger, request, context),
    );
  }

  /**
   * Invoke the handler, reporting a failure the way real Cognito reports one.
   *
   * The handler's own message is repeated because that is the whole mechanism a
   * `PreAuthentication` trigger refuses a sign-in with: it throws, and the
   * words it threw are what the caller is told.
   */
  private async invoke(
    trigger: SimCognitoTriggerName,
    request: SimCognitoTriggerFunctionRequest,
    context: SimCognitoTriggerContext,
  ): Promise<unknown> {
    try {
      return await this.functions.invoke(
        request,
        new SimCognitoTriggerEvent(context).document(trigger),
      );
    } catch (error) {
      throw new SimCognitoUserLambdaValidationException(
        `${trigger} failed with error ${
          error instanceof Error ? error.message : String(error)
        }.`,
      );
    }
  }
}
