import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { simStatesTagConditionIam } from "./machine/sim-state-machine-resource-tags.js";
import type * as simStatesCommands from "./command/sim-step-functions-command.types.js";
import { SimStepFunctionsAuthorizer } from "./command/authorize/sim-step-functions-authorizer.js";
import { simStatesAuthorizeRequest } from "./command/authorize/sim-step-functions-authorize-request.js";
import { SimStatesExecutionDescribe } from "./command/execution/sim-states-execution-describe.js";
import { SimStatesExecutionStart } from "./command/execution/sim-states-execution-start.js";
import { SimStateMachineCreate } from "./command/machine/sim-state-machine-create.js";
import { SimStateMachineReads } from "./command/machine/sim-state-machine-reads.js";
import { SimStateMachineDelete } from "./command/machine/sim-state-machine-delete.js";
import { SimStateMachineUpdate } from "./command/machine/sim-state-machine-update.js";
import { SimStateMachineTagCommands } from "./command/tag/sim-state-machine-tag-commands.js";
import type { SimStepFunctionsRequestOptions } from "./command/sim-step-functions-request-options.js";
import {
  type SimStatesDefinitionStore,
  SimStatesNoDefinitionStore,
} from "./definition/store/sim-states-definition-store.js";
import { SimStatesExecutionStore } from "./execution/sim-states-execution-store.js";
import type { SimStateMachine } from "./machine/sim-state-machine.js";
import { SimStateMachineStore } from "./machine/sim-state-machine-store.js";
import { SimStepFunctionsCfnResourceFactory } from "./cfn/sim-step-functions-cfn-resource-factory.js";
import { SimStepFunctionsSdkCommandRouter } from "./sdk/sim-step-functions-sdk-command-router.js";
import { SimStatesNoTaskTargets } from "./task/sim-states-no-task-targets.js";
import type { SimStatesTaskTargets } from "./task/sim-states-task-invocation.js";
import { SimStepFunctionsInspection } from "./sim-step-functions-inspection.js";

interface SimStepFunctionsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where a `Task` state does its work. A simulated Step Functions built on
   * its own has nowhere to invoke, and says so at the first task.
   */
  readonly taskTargets?: SimStatesTaskTargets;

  /**
   * Where a `DefinitionS3Location` on a CloudFormation Resource is read from.
   * A simulated Step Functions built on its own has no bucket to read.
   */
  readonly definitions?: SimStatesDefinitionStore;
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
 * Every operation here is decided by simulated IAM, and a policy reads a
 * state machine's tags as `aws:ResourceTag/<key>`.
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
  readonly #machineUpdate: SimStateMachineUpdate;
  readonly #machineDelete: SimStateMachineDelete;
  readonly #machineCreate: SimStateMachineCreate;
  readonly #executionStart: SimStatesExecutionStart;
  readonly #executionDescribe: SimStatesExecutionDescribe;
  readonly #tagCommands: SimStateMachineTagCommands;
  readonly #background: BackgroundScheduler;
  readonly #sdkRouter = new SimStepFunctionsSdkCommandRouter(this);
  readonly #cfnFactory: SimStepFunctionsCfnResourceFactory;
  readonly #inspection = new SimStepFunctionsInspection(this.#executions);
  readonly #authorizer: SimStepFunctionsAuthorizer;

  constructor(properties: SimStepFunctionsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      taskTargets = new SimStatesNoTaskTargets(),
      definitions = new SimStatesNoDefinitionStore(),
    } = properties;

    const authorizer = new SimStepFunctionsAuthorizer({
      iam: simStatesTagConditionIam(
        simIamInRegion(properties.iam, accountRegionScope.regionName),
        this.#stateMachines,
      ),
      accountRegionScope,
    });

    this.#authorizer = authorizer;
    this.#tagCommands = new SimStateMachineTagCommands({
      stateMachines: this.#stateMachines,
      authorizer,
    });

    this.#background = background;
    this.#cfnFactory = new SimStepFunctionsCfnResourceFactory({
      stepFunctions: this,
      definitions,
    });
    this.#machineReads = new SimStateMachineReads(this.#stateMachines);
    this.#machineUpdate = new SimStateMachineUpdate({
      stateMachines: this.#stateMachines,
      background,
    });
    this.#machineDelete = new SimStateMachineDelete({
      stateMachines: this.#stateMachines,
      authorizer,
      executions: this.#executions,
    });
    this.#machineCreate = new SimStateMachineCreate({
      stateMachines: this.#stateMachines,
      authorizer,
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
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimCreateStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineCreate.handle(command, options);
  }

  /** Handle a DescribeStateMachine Command from the SDK. */
  async describeStateMachine(
    command: simStatesCommands.SimDescribeStateMachineCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDescribeStateMachineCommandOutput> {
    await this.#background.sequence();
    this.#allow("DescribeStateMachine", command.input.stateMachineArn, options);
    return this.#machineReads.describe(command);
  }

  /** Handle an UpdateStateMachine Command from the SDK. */
  async updateStateMachine(
    command: simStatesCommands.SimUpdateStateMachineCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimUpdateStateMachineCommandOutput> {
    await this.#background.sequence();
    this.#allow("UpdateStateMachine", command.input.stateMachineArn, options);
    return this.#machineUpdate.handle(command);
  }

  /** Handle a DeleteStateMachine Command from the SDK. */
  async deleteStateMachine(
    command: simStatesCommands.SimDeleteStateMachineCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDeleteStateMachineCommandOutput> {
    await this.#background.sequence();
    return this.#machineDelete.handle(command, options);
  }

  /** Handle a ListStateMachines Command from the SDK. */
  async listStateMachines(
    command: simStatesCommands.SimListStateMachinesCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimListStateMachinesCommandOutput> {
    await this.#background.sequence();
    this.#allow("ListStateMachines", "*", options);
    return this.#machineReads.list(command);
  }

  /** Handle a TagResource Command from the SDK. */
  async tagResource(
    command: simStatesCommands.SimTagResourceCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimTagResourceCommandOutput> {
    await this.#background.sequence();
    return this.#tagCommands.tagResource(command, options);
  }

  /** Handle an UntagResource Command from the SDK. */
  async untagResource(
    command: simStatesCommands.SimUntagResourceCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimUntagResourceCommandOutput> {
    await this.#background.sequence();
    return this.#tagCommands.untagResource(command, options);
  }

  /** Handle a ListTagsForResource Command from the SDK. */
  async listTagsForResource(
    command: simStatesCommands.SimListTagsForResourceCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimListTagsForResourceCommandOutput> {
    await this.#background.sequence();
    this.#allow("ListTagsForResource", command.input.resourceArn, options);
    return this.#tagCommands.listTagsForResource(command);
  }

  /** Handle a StartExecution Command from the SDK. */
  async startExecution(
    command: simStatesCommands.SimStartExecutionCommand,
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimStartExecutionCommandOutput> {
    await this.#background.sequence();
    this.#allow("StartExecution", command.input.stateMachineArn, options);

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
    options?: SimStepFunctionsRequestOptions,
  ): Promise<simStatesCommands.SimDescribeExecutionCommandOutput> {
    await this.#background.sequence();
    this.#allow("DescribeExecution", command.input.executionArn, options);
    return this.#executionDescribe.handle(command);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimStepFunctionsCfnResourceFactory {
    return this.#cfnFactory;
  }

  /**
   * Ensure the caller may perform a Step Functions operation on the resource
   * a request names.
   */
  #allow(
    operation: string,
    resource: string | undefined,
    options: SimStepFunctionsRequestOptions | undefined,
  ): void {
    simStatesAuthorizeRequest(
      this.#authorizer,
      `states:${operation}`,
      resource,
      options,
    );
  }
}
