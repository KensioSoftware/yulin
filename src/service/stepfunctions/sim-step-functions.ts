import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type * as simStatesCommands from "./command/sim-step-functions-command.types.js";
import { SimStatesExecutionDescribe } from "./command/execution/sim-states-execution-describe.js";
import { SimStatesExecutionStart } from "./command/execution/sim-states-execution-start.js";
import { SimStateMachineCreate } from "./command/machine/sim-state-machine-create.js";
import { SimStateMachineReads } from "./command/machine/sim-state-machine-reads.js";
import { SimStateMachineWrites } from "./command/machine/sim-state-machine-writes.js";
import type { SimStepFunctionsRequestOptions } from "./command/sim-step-functions-request-options.js";
import { SimStatesExecutionStore } from "./execution/sim-states-execution-store.js";
import type { SimStateMachine } from "./machine/sim-state-machine.js";
import { SimStateMachineStore } from "./machine/sim-state-machine-store.js";
import { SimStepFunctionsSdkCommandRouter } from "./sdk/sim-step-functions-sdk-command-router.js";
import { SimStatesNoTaskTargets } from "./task/sim-states-no-task-targets.js";
import type { SimStatesTaskTargets } from "./task/sim-states-task-invocation.js";
import { SimStepFunctionsInspection } from "./sim-step-functions-inspection.js";

interface SimStepFunctionsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;

  /**
   * Where a `Task` state does its work. A simulated Step Functions built on
   * its own has nowhere to invoke, and says so at the first task.
   */
  readonly taskTargets?: SimStatesTaskTargets;
}

/**
 * Simulated Step Functions. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * A state machine's definition is checked when it is created, so an execution
 * walks a definition it can rely on. The state types this runs are `Pass`,
 * `Task`, `Choice`, `Wait`, `Succeed` and `Fail`, and a definition using any
 * other is refused by name.
 *
 * An execution runs on the simulation's background scheduler rather than in
 * the `StartExecution` call. An execution with nothing to wait for settles
 * before the caller sees it. A failing execution records the failure and never
 * raises out of the scheduler, following the way simulated EventBridge records
 * a delivery it could not make.
 */
export class SimStepFunctions {
  readonly #stateMachines = new SimStateMachineStore();
  readonly #executions = new SimStatesExecutionStore();
  readonly #machineReads: SimStateMachineReads;
  readonly #machineWrites: SimStateMachineWrites;
  readonly #machineCreate: SimStateMachineCreate;
  readonly #executionStart: SimStatesExecutionStart;
  readonly #executionDescribe: SimStatesExecutionDescribe;
  readonly #background: BackgroundScheduler;
  readonly #sdkRouter = new SimStepFunctionsSdkCommandRouter(this);
  readonly #inspection = new SimStepFunctionsInspection(this.#executions);

  constructor(properties: SimStepFunctionsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      taskTargets = new SimStatesNoTaskTargets(),
    } = properties;

    this.#background = background;
    this.#machineReads = new SimStateMachineReads(this.#stateMachines);
    this.#machineWrites = new SimStateMachineWrites({
      stateMachines: this.#stateMachines,
      executions: this.#executions,
      background,
    });
    this.#machineCreate = new SimStateMachineCreate({
      stateMachines: this.#stateMachines,
      accountRegionScope,
      background,
    });
    this.#executionStart = new SimStatesExecutionStart({
      stateMachines: this.#stateMachines,
      executions: this.#executions,
      accountRegionScope,
      background,
      tasks: taskTargets,
    });
    this.#executionDescribe = new SimStatesExecutionDescribe(this.#executions);
  }

  /**
   * Find a state machine by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * state machines without going through a Command.
   */
  findStateMachine(name: string): SimStateMachine | undefined {
    return this.#stateMachines.findByName(name);
  }

  /**
   * What a test can read about the executions this service has run.
   */
  inspection(): SimStepFunctionsInspection {
    return this.#inspection;
  }

  /** Handle a CreateStateMachine Command from the SDK. */
  async createStateMachine(
    command: simStatesCommands.SimCreateStateMachineCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimCreateStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineCreate.handle(command);
  }

  /** Handle a DescribeStateMachine Command from the SDK. */
  async describeStateMachine(
    command: simStatesCommands.SimDescribeStateMachineCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDescribeStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineReads.describe(command);
  }

  /** Handle an UpdateStateMachine Command from the SDK. */
  async updateStateMachine(
    command: simStatesCommands.SimUpdateStateMachineCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimUpdateStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineWrites.update(command);
  }

  /** Handle a DeleteStateMachine Command from the SDK. */
  async deleteStateMachine(
    command: simStatesCommands.SimDeleteStateMachineCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDeleteStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineWrites.delete(command);
  }

  /** Handle a ListStateMachines Command from the SDK. */
  async listStateMachines(
    command: simStatesCommands.SimListStateMachinesCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimListStateMachinesCommandOutput> {
    await this.#background.sequence();
    return this.#machineReads.list(command);
  }

  /** Handle a StartExecution Command from the SDK. */
  async startExecution(
    command: simStatesCommands.SimStartExecutionCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimStartExecutionCommandOutput> {
    await this.#background.sequence();

    const started = this.#executionStart.handle(command);

    // The walk was scheduled rather than run. Yielding here lets an execution
    // with nothing to wait for finish before the caller reads it back, which
    // is what a test asserting straight after StartExecution expects.
    await this.#background.sequence();

    return started;
  }

  /** Handle a DescribeExecution Command from the SDK. */
  async describeExecution(
    command: simStatesCommands.SimDescribeExecutionCommand,
    _options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDescribeExecutionCommandOutput> {
    await this.#background.sequence();
    return this.#executionDescribe.handle(command);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}
