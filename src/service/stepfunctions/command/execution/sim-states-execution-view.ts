import type { JSONValue } from "../../../../util/type-guard/json.js";
import { SimStatesInvalidRequest } from "../../error/sim-step-functions.error.js";
import type { SimStatesExecution } from "../../execution/sim-states-execution.js";
import type * as commands from "./execution.command.js";

/**
 * Read the JSON an execution was started with.
 *
 * Real Step Functions takes the input as a JSON string and gives an execution
 * an empty object where the request carried nothing.
 */
export function readSimStatesExecutionInput(
  input: string | undefined,
): JSONValue {
  if (input === undefined) {
    return {};
  }

  try {
    return JSON.parse(input) as JSONValue;
  } catch {
    throw new SimStatesInvalidRequest(
      "The execution input is not JSON. StartExecution takes it as a JSON string.",
    );
  }
}

/**
 * What `DescribeExecution` answers with.
 *
 * The fields an execution has not got are left off rather than sent as
 * undefined, which is how the SDK shapes an answer from real Step Functions.
 */
export function simStatesExecutionView(
  execution: SimStatesExecution,
): commands.SimDescribeExecutionCommandOutput {
  return {
    executionArn: execution.arn,
    stateMachineArn: execution.stateMachineArn,
    name: execution.name,
    status: execution.status,
    startDate: execution.startDate,
    input: JSON.stringify(execution.input),
    ...(execution.stopDate !== undefined && { stopDate: execution.stopDate }),
    ...(execution.output !== undefined && {
      output: JSON.stringify(execution.output),
    }),
    ...(execution.error !== undefined && { error: execution.error }),
    ...(execution.cause !== undefined && { cause: execution.cause }),
  };
}
