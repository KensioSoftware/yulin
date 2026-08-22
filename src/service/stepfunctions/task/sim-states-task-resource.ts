import { parseSimLambdaFunctionArn } from "../../lambda/function/sim-lambda-function-arn-parts.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import { SimStatesFunctionArnTarget } from "./sim-states-function-arn-target.js";
import { checkSimStatesLambdaInvokeParameters } from "./sim-states-lambda-invoke-parameters.js";
import {
  SimStatesLambdaInvokeTarget,
  simStatesLambdaInvokeResource,
} from "./sim-states-lambda-invoke-target.js";
import { parseSimStatesServiceResource } from "./service/sim-states-service-resource.js";
import type { SimStatesTaskTarget } from "./sim-states-task-target.js";

/**
 * What every service integration's `Resource` starts with.
 */
const statesIntegrationPrefix = "arn:aws:states:::";

/**
 * Read what a `Task` state's `Resource` names.
 *
 * This runs when the state machine is created, so a `Resource` this simulator
 * cannot reach is refused there rather than when an execution arrives at the
 * state. Every refusal is reached from here, so a definition is told once what
 * this simulator does and does not run.
 */
export function parseSimStatesTaskResource(
  stateName: string,
  state: Record<string, JSONValue>,
): SimStatesTaskTarget {
  const resource = state["Resource"];

  if (typeof resource !== "string" || resource === "") {
    throw new SimStatesInvalidDefinition(
      `The Task state ${stateName} has no Resource saying what it does.`,
    );
  }

  if (resource === simStatesLambdaInvokeResource) {
    checkSimStatesLambdaInvokeParameters(stateName, state["Parameters"]);

    return new SimStatesLambdaInvokeTarget();
  }

  if (parseSimLambdaFunctionArn(resource) !== undefined) {
    return new SimStatesFunctionArnTarget({ functionArn: resource });
  }

  if (resource.startsWith(statesIntegrationPrefix)) {
    return parseSimStatesServiceResource(
      stateName,
      resource,
      resource.slice(statesIntegrationPrefix.length),
    );
  }

  throw new SimStatesUnsimulatedInput(
    `The Task state ${stateName} has a Resource of ${resource}, which this ` +
      "simulator does not run. A Task state invokes a simulated Lambda " +
      "function, through a function ARN or " +
      `${simStatesLambdaInvokeResource}, or calls a simulated service ` +
      "through a service integration.",
  );
}
