import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { JSONObject } from "../../src/util/type-guard/json.js";
import { statesExecutionRoleFactory } from "./states-execution-role.factory.js";
import { statesMachineFactory } from "./states-machine.factory.js";

/**
 * What a `Task` state test asks for when it wants an execution of a workflow
 * built around one task.
 */
export interface StatesTaskExecutionInput {
  /**
   * The task, which the execution starts at under the name `Check`.
   */
  readonly task: JSONObject;

  /**
   * The states the task can move on to, written as Amazon States Language.
   */
  readonly states: JSONObject;

  /**
   * The execution input, as the JSON string `StartExecution` takes.
   */
  readonly input: string;
}

/**
 * Creates a state machine of one task, starts an execution of it, and answers
 * with the execution ARN.
 *
 * ```typescript
 * const executionArn = await statesTaskExecutionFactory.make(
 *   { task: { Type: "Task", Resource: check.arn, End: true } },
 *   simAws,
 * );
 * ```
 *
 * The execution role is one that may invoke anything, since a test about what
 * a task does when it fails is not a test about what its role is allowed.
 */
export const statesTaskExecutionFactory = new AsyncMappedFactory<
  StatesTaskExecutionInput,
  string,
  SimAws
>(
  () => ({
    task: { Type: "Succeed" },
    states: {},
    input: '{"student":"Wei"}',
  }),
  async (input, simAws) => {
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn: await statesExecutionRoleFactory.make({}, simAws),
        startAt: "Check",
        states: { Check: input.task, ...input.states },
      },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: input.input } });

    return started.executionArn;
  },
);
