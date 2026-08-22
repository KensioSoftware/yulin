import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simStatesContextObject } from "../../data/sim-states-context-object.js";
import { SimStatesExecution } from "../../execution/sim-states-execution.js";
import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import { simStatesWalks } from "../../execution/sim-states-walks.js";
import { simStatesExecutionArn } from "../../machine/sim-state-machine-arn.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type { SimStatesTaskTargets } from "../../task/sim-states-task-invocation.js";
import { requireSimStateMachine } from "../machine/sim-state-machine-lookup.js";
import type {
  SimStartExecutionCommand,
  SimStartExecutionCommandOutput,
} from "./execution.command.js";
import { chooseSimStatesExecutionName } from "./sim-states-execution-name.js";
import { answerSimStatesRepeatedStart } from "./sim-states-execution-repeat.js";
import { readSimStatesExecutionInput } from "./sim-states-execution-view.js";

interface SimStatesExecutionStartProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly executions: SimStatesExecutionStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly tasks: SimStatesTaskTargets;
}

/**
 * The command that starts an execution.
 */
export class SimStatesExecutionStart {
  readonly #stateMachines: SimStateMachineStore;
  readonly #executions: SimStatesExecutionStore;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #background: BackgroundScheduler;
  readonly #tasks: SimStatesTaskTargets;

  constructor(properties: SimStatesExecutionStartProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#executions = properties.executions;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#background = properties.background;
    this.#tasks = properties.tasks;
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

    const already = this.#executions.findByName(
      stateMachine.arn,
      executionName,
    );

    if (already !== undefined) {
      return answerSimStatesRepeatedStart(already, stateMachine.name, input);
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

    await simStatesWalks({
      background: this.#background,
      tasks: this.#tasks,
      roleArn: stateMachine.roleArn,
    })({
      definition: stateMachine.parsedDefinition,
      record: execution,
      contextObject: simStatesContextObject({
        executionArn: execution.arn,
        executionName: execution.name,
        input: execution.input,
        startDate,
        stateMachineArn: stateMachine.arn,
        stateMachineName: stateMachine.name,
        roleArn: stateMachine.roleArn,
      }),
    }).run();

    return { executionArn: execution.arn, startDate };
  }
}
