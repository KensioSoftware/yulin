import { SimStatesExecutionAlreadyExists } from "../../error/sim-step-functions.error.js";
import type { SimStatesExecution } from "../../execution/sim-states-execution.js";
import type { SimStartExecutionCommandOutput } from "./execution.command.js";
import { readSimStatesExecutionInput } from "./sim-states-execution-view.js";

/**
 * Answer a start that names an execution already there.
 *
 * `StartExecution` on a Standard workflow is idempotent. A repeat naming an
 * execution that is still running, and carrying the same input, answers with
 * that execution's own response. A repeat naming one that has finished, or
 * carrying different input, is a name collision.
 */
export function answerSimStatesRepeatedStart(
  already: SimStatesExecution,
  stateMachineName: string,
  input: string | undefined,
): SimStartExecutionCommandOutput {
  const sameInput =
    JSON.stringify(already.input) ===
    JSON.stringify(readSimStatesExecutionInput(input));

  if (sameInput && already.status === "RUNNING") {
    return { executionArn: already.arn, startDate: already.startDate };
  }

  throw new SimStatesExecutionAlreadyExists(
    `${stateMachineName} already has an execution called ${already.name}. ` +
      "A repeat is answered with the execution already there only while it " +
      "is still running on the same input.",
  );
}
