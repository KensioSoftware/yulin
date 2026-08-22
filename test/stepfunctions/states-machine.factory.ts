import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { JSONObject } from "../../src/util/type-guard/json.js";

/**
 * What a test asks for when it wants a state machine to run.
 */
export interface StatesMachineInput {
  readonly name: string;
  readonly roleArn: string;
  readonly startAt: string;

  /**
   * The states, written as Amazon States Language.
   */
  readonly states: JSONObject;
}

/**
 * Creates a state machine and answers with its ARN.
 *
 * ```typescript
 * const stateMachineArn = await statesMachineFactory.make(
 *   {
 *     roleArn,
 *     startAt: "Check",
 *     states: { Check: { Type: "Succeed" } },
 *   },
 *   simAws,
 * );
 * ```
 *
 * The definition is written as an object and serialised here, since a test
 * reads a state machine more easily than it reads a JSON string.
 */
export const statesMachineFactory = new AsyncMappedFactory<
  StatesMachineInput,
  string,
  SimAws
>(
  () => ({
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    startAt: "Check",
    states: { Check: { Type: "Succeed" } },
  }),
  async (input, simAws) => {
    const created = await simAws.stepFunctions().createStateMachine({
      input: {
        name: input.name,
        roleArn: input.roleArn,
        definition: JSON.stringify({
          StartAt: input.startAt,
          States: input.states,
        }),
      },
    });

    return created.stateMachineArn;
  },
);
