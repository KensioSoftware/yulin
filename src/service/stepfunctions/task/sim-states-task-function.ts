import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import type { SimLambdaFunctionReference } from "../../lambda/function/sim-lambda-function-reference.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesTaskFailure } from "../error/sim-step-functions.error.js";
import type { SimStatesTaskTarget } from "./sim-states-task-target.js";

/**
 * The action an execution needs to invoke a function.
 */
const invokeAction = "lambda:InvokeFunction";

interface SimStatesTaskFunctionProperties {
  readonly scope: SimAwsAccountRegionContainer;
}

/**
 * One `Task` state's invocation of a function.
 */
export interface SimStatesTaskFunctionRequest {
  readonly stateName: string;
  readonly target: SimStatesTaskTarget;
  readonly reference: SimLambdaFunctionReference;

  /**
   * What the state named the function, which is what its messages say.
   */
  readonly named: string;

  readonly payload: JSONValue;
  readonly caller: SimAwsCaller;
}

/**
 * A Lambda function a `Task` state invokes, in the Account and Region the
 * function is in.
 *
 * The function is resolved on every task rather than when the state machine
 * was created, so an alias moved to another version moves what runs and a
 * permission taken away stops the task.
 */
export class SimStatesTaskFunction {
  readonly #scope: SimAwsAccountRegionContainer;

  constructor(properties: SimStatesTaskFunctionProperties) {
    this.#scope = properties.scope;
  }

  /**
   * Invoke the function as the execution role, if the role may.
   */
  async invoke(request: SimStatesTaskFunctionRequest): Promise<JSONValue> {
    const found = this.#scope
      .lambda()
      .getSimFunctionTarget(
        request.reference.functionName,
        request.reference.qualifier,
      );

    if (found === undefined) {
      throw new SimStatesTaskFailure(
        `The Task state ${request.stateName} invokes ${request.named}, ` +
          "which is not a simulated Lambda function.",
      );
    }

    this.authorize(request, found.resource.arn);

    const result = await this.run(request, found.simFunction);

    return request.target.answer(result, found.simFunction.version);
  }

  /**
   * Ask the function's own Account whether the execution role may invoke it.
   *
   * The function's resource policy is not consulted, which is the difference
   * from an EventBridge rule target. The task arrives as an assumed role
   * rather than as a service principal, and a role in the same Account needs
   * only its own identity policy.
   */
  private authorize(
    request: SimStatesTaskFunctionRequest,
    functionArn: string,
  ): void {
    const decision = this.#scope.iam().authorize({
      action: invokeAction,
      resource: functionArn,
      caller: request.caller,
    });

    if (decision.isDenied) {
      throw new SimStatesTaskFailure(
        `The Task state ${request.stateName} is not allowed to ` +
          `${invokeAction} on ${functionArn}. Grant it in a policy on the ` +
          "state machine's execution role.",
      );
    }
  }

  /**
   * Run the handler, and read a task failure off it raising.
   *
   * Invoked directly rather than through an `Invoke` command, because a
   * handler failure has to reach the task rather than being answered as an
   * error payload the state would take for a result.
   */
  private async run(
    request: SimStatesTaskFunctionRequest,
    simFunction: SimLambdaFunction,
  ): Promise<JSONValue> {
    let result: unknown;

    try {
      result = await simFunction.invoke(request.payload);
    } catch (error) {
      throw request.target.handlerFailure(error, request.stateName);
    }

    return readTaskResult(result, request.stateName);
  }
}

/**
 * Read what the handler answered as the JSON the execution carries on with.
 *
 * The answer crosses the same JSON serialisation a real invocation's payload
 * does, so a `Date` a handler returns reaches the next state as the string it
 * would there, and a handler answering with nothing answers `null`.
 */
function readTaskResult(result: unknown, stateName: string): JSONValue {
  if (result === undefined) {
    return null;
  }

  let serialised: string;

  try {
    serialised = JSON.stringify(result);
  } catch {
    throw new SimStatesTaskFailure(
      `The function the Task state ${stateName} invoked answered with ` +
        "something that is not JSON.",
    );
  }

  return JSON.parse(serialised) as JSONValue;
}
