import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import { checkSimStatesName } from "../../machine/sim-states-name.js";

/**
 * The name an execution runs under.
 *
 * Real Step Functions generates a UUID for an unnamed execution. A counter is
 * used here because a simulation answering the same way twice is worth more
 * than a name that looks right, and nothing reads meaning out of it. It steps
 * over a name a caller has already used, so an unnamed start never fails over
 * a name its caller never wrote.
 */
export function chooseSimStatesExecutionName(
  executions: SimStatesExecutionStore,
  stateMachineArn: string,
  name: string | undefined,
): string {
  if (name !== undefined) {
    return checkSimStatesName(name, "The execution name");
  }

  let index = executions.forStateMachine(stateMachineArn).length;
  let candidate: string;

  do {
    index += 1;
    candidate = `execution-${String(index)}`;
  } while (executions.hasName(stateMachineArn, candidate));

  return candidate;
}
