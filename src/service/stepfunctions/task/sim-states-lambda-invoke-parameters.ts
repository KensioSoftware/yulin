import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import {
  simStatesLambdaInvokeParameters,
  simStatesLambdaInvokeResource,
} from "./sim-states-lambda-invoke-target.js";

/**
 * Check the `Invoke` request the state's `Parameters` build.
 *
 * The field naming the function is required, as it is on real Step Functions,
 * and the fields of an `Invoke` this does not make are refused by name.
 */
export function checkSimStatesLambdaInvokeParameters(
  stateName: string,
  parameters: JSONValue | undefined,
): void {
  if (!isRecord(parameters)) {
    throw new SimStatesInvalidDefinition(
      `The Task state ${stateName} invokes a function and carries no ` +
        "Parameters. A Parameters naming the function to invoke is what " +
        `${simStatesLambdaInvokeResource} takes.`,
    );
  }

  const fields = Object.keys(parameters).map(fieldName);

  if (!fields.includes("FunctionName")) {
    throw new SimStatesInvalidDefinition(
      `The Parameters of the Task state ${stateName} carry no FunctionName ` +
        "naming the function to invoke.",
    );
  }

  const beyond = fields.filter(
    (field) => !simStatesLambdaInvokeParameters.includes(field as never),
  );

  if (beyond.length > 0) {
    throw new SimStatesUnsimulatedInput(
      `The Parameters of the Task state ${stateName} carry ` +
        `${beyond.join(", ")}. This simulator invokes a function with ` +
        `${simStatesLambdaInvokeParameters.join(" and ")}.`,
    );
  }
}

/**
 * The field one Payload Template key stands for.
 *
 * A key ending in `.$` holds a path to read rather than a value, and both
 * spellings name the same field of the request.
 */
function fieldName(key: string): string {
  return key.endsWith(".$") ? key.slice(0, -2) : key;
}
