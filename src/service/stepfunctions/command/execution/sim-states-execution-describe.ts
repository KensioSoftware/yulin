import {
  SimStatesExecutionNotFound,
  SimStatesInvalidRequest,
} from "../../error/sim-step-functions.error.js";
import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import type {
  SimDescribeExecutionCommand,
  SimDescribeExecutionCommandOutput,
} from "./execution.command.js";
import { simStatesExecutionView } from "./sim-states-execution-view.js";

/**
 * The command that reads an execution back.
 */
export class SimStatesExecutionDescribe {
  readonly #executions: SimStatesExecutionStore;

  constructor(executions: SimStatesExecutionStore) {
    this.#executions = executions;
  }

  handle(
    command: SimDescribeExecutionCommand,
  ): SimDescribeExecutionCommandOutput {
    const { executionArn } = command.input;

    if (executionArn === undefined) {
      throw new SimStatesInvalidRequest(
        "DescribeExecution needs an executionArn.",
      );
    }

    const execution = this.#executions.find(executionArn);

    if (execution === undefined) {
      throw new SimStatesExecutionNotFound(
        `${executionArn} is not a simulated execution in this Account and Region.`,
      );
    }

    return simStatesExecutionView(execution);
  }
}
