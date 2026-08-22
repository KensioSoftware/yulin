import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";

/**
 * What the context object says about the execution and its state machine.
 *
 * These are the same for every state one execution runs, the states inside a
 * `Parallel` branch and a `Map` iteration included, so they are built once
 * when the execution starts.
 */
export interface SimStatesExecutionContext {
  readonly executionArn: string;
  readonly executionName: string;
  readonly input: JSONValue;
  readonly startDate: Date;
  readonly stateMachineArn: string;
  readonly stateMachineName: string;
  readonly roleArn: string;
}

/**
 * What one state adds to the context object while it runs.
 */
export interface SimStatesStateContextEntry {
  readonly name: string;
  readonly enteredTime: Date;
  readonly retryCount: number;
}

/**
 * The context object an execution's states read through `$$`.
 *
 * Real Step Functions also carries `$$.Task.Token`, which belongs with the
 * task tokens this simulator has no implementation for. A path reading one
 * selects nothing and fails the state that read it.
 */
export function simStatesContextObject(
  execution: SimStatesExecutionContext,
): JSONObject {
  return {
    Execution: {
      Id: execution.executionArn,
      Input: execution.input,
      Name: execution.executionName,
      RoleArn: execution.roleArn,
      StartTime: execution.startDate.toISOString(),
    },
    StateMachine: {
      Id: execution.stateMachineArn,
      Name: execution.stateMachineName,
    },
  };
}

/**
 * The same context object with what the state now running adds to it.
 */
export function simStatesStateContext(
  contextObject: JSONObject,
  state: SimStatesStateContextEntry,
): JSONObject {
  return {
    ...contextObject,
    State: {
      EnteredTime: state.enteredTime.toISOString(),
      Name: state.name,
      RetryCount: state.retryCount,
    },
  };
}

/**
 * The same context object with the item one `Map` iteration is running for.
 *
 * `ItemSelector` reads this while the `Map` state builds the iteration's
 * input, and so do the states inside the iteration once it starts.
 */
export function simStatesMapItemContext(
  contextObject: JSONObject,
  index: number,
  value: JSONValue,
): JSONObject {
  return {
    ...contextObject,
    Map: { Item: { Index: index, Value: value } },
  };
}
