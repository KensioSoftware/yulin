import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { JSONObject } from "../../src/util/type-guard/json.js";
import { statesExecutionRoleFactory } from "./states-execution-role.factory.js";
import { statesMachineFactory } from "./states-machine.factory.js";

/**
 * What a test asks for when it wants an execution of a workflow built around
 * one state.
 */
export interface StatesExecutionInput {
  /**
   * The state under test, which the execution starts at under the name
   * `Check`.
   */
  readonly state: JSONObject;

  /**
   * The states that one can move on to, written as Amazon States Language.
   */
  readonly states: JSONObject;

  /**
   * The execution input, as the JSON string `StartExecution` takes.
   */
  readonly input: string;
}

/**
 * Creates a state machine built around one state, starts an execution of it,
 * and answers with the execution ARN.
 *
 * ```typescript
 * const executionArn = await statesExecutionFactory.make(
 *   { state: { Type: "Task", Resource: check.arn, End: true } },
 *   simAws,
 * );
 * ```
 *
 * The execution role is one that may invoke anything, since a test about what
 * a state does when it fails is not a test about what its role is allowed.
 */
export const statesExecutionFactory = new AsyncMappedFactory<
  StatesExecutionInput,
  string,
  SimAws
>(
  () => ({
    state: { Type: "Succeed" },
    states: {},
    input: '{"student":"Wei"}',
  }),
  async (input, simAws) => {
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn: await statesExecutionRoleFactory.make({}, simAws),
        startAt: "Check",
        states: { Check: input.state, ...input.states },
      },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: input.input } });

    return started.executionArn;
  },
);
