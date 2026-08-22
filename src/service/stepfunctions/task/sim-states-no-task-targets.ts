import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesTaskFailure } from "../error/sim-step-functions.error.js";
import type {
  SimStatesTaskInvocation,
  SimStatesTaskTargets,
} from "./sim-states-task-invocation.js";

/**
 * What a simulated Step Functions built on its own can invoke, which is
 * nothing.
 *
 * A Lambda function in another simulated service is only reachable through
 * SimAws, so a `SimStepFunctions` constructed directly has nowhere to send a
 * task. Every task fails saying so, rather than quietly succeeding: a state
 * machine that appears to have invoked a function that was never reachable is
 * the worst of the possible answers.
 */
export class SimStatesNoTaskTargets implements SimStatesTaskTargets {
  invoke(invocation: SimStatesTaskInvocation): Promise<JSONValue> {
    return Promise.reject(
      new SimStatesTaskFailure(
        `This simulated Step Functions has no functions to invoke, so the ` +
          `Task state ${invocation.stateName} did nothing. Reach Step ` +
          "Functions through SimAws for a state machine that invokes one.",
      ),
    );
  }
}
