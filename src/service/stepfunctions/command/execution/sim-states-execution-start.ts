import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimStatesExecutionAlreadyExists } from "../../error/sim-step-functions.error.js";
import { SimStatesExecution } from "../../execution/sim-states-execution.js";
import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import { SimStatesInterpreter } from "../../execution/sim-states-interpreter.js";
import { simStatesExecutionArn } from "../../machine/sim-state-machine-arn.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import { requireSimStateMachine } from "../machine/sim-state-machine-lookup.js";
import type {
  SimStartExecutionCommand,
  SimStartExecutionCommandOutput,
} from "./execution.command.js";
import { chooseSimStatesExecutionName } from "./sim-states-execution-name.js";
import { readSimStatesExecutionInput } from "./sim-states-execution-view.js";

interface SimStatesExecutionStartProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly executions: SimStatesExecutionStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

/**
 * The command that starts an execution.
 */
export class SimStatesExecutionStart {
  readonly #stateMachines: SimStateMachineStore;
  readonly #executions: SimStatesExecutionStore;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStatesExecutionStartProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#executions = properties.executions;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#background = properties.background;
  }

  /**
   * Start an execution and answer with its ARN.
   *
   * The walk runs as far as it can before this answers. An execution with
   * nothing to wait for has finished by the time the caller reads it back, and
   * one reaching a state that waits on the clock is left `RUNNING` for
   * `advanceBy` to move on.
   *
   * Real `StartExecution` answers before the execution has run at all, so a
   * caller there sees `RUNNING` first. Settling here instead spares every test
   * a wait for something that has no work left to do, and the docs record the
   * divergence.
   */
  async handle(
    command: SimStartExecutionCommand,
  ): Promise<SimStartExecutionCommandOutput> {
    const { stateMachineArn, name, input } = command.input;
    const stateMachine = requireSimStateMachine(
      this.#stateMachines,
      stateMachineArn,
      "StartExecution",
    );
    const executionName = chooseSimStatesExecutionName(
      this.#executions,
      stateMachine.arn,
      name,
    );

    if (this.#executions.hasName(stateMachine.arn, executionName)) {
      throw new SimStatesExecutionAlreadyExists(
        `${stateMachine.name} already has an execution called ${executionName}.`,
      );
    }

    const startDate = this.#background.now();
    const execution = new SimStatesExecution({
      arn: simStatesExecutionArn(
        this.#accountRegionScope,
        stateMachine.name,
        executionName,
      ),
      name: executionName,
      stateMachineArn: stateMachine.arn,
      input: readSimStatesExecutionInput(input),
      startDate,
    });

    this.#executions.add(execution);

    await new SimStatesInterpreter({
      definition: stateMachine.parsedDefinition,
      execution,
      background: this.#background,
    }).run();

    return { executionArn: execution.arn, startDate };
  }
}
