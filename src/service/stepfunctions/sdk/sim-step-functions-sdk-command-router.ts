import {
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
  simSdkCallerOptions,
} from "../../../sdk/index.js";
import type * as simStatesCommands from "../command/sim-step-functions-command.types.js";
import type { SimStepFunctions } from "../sim-step-functions.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Step Functions.
 */
export class SimStepFunctionsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simStepFunctions: SimStepFunctions) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateStateMachineCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.createStateMachine(
            command as simStatesCommands.SimCreateStateMachineCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeStateMachineCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.describeStateMachine(
            command as simStatesCommands.SimDescribeStateMachineCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateStateMachineCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.updateStateMachine(
            command as simStatesCommands.SimUpdateStateMachineCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteStateMachineCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.deleteStateMachine(
            command as simStatesCommands.SimDeleteStateMachineCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListStateMachinesCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.listStateMachines(
            command as simStatesCommands.SimListStateMachinesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "StartExecutionCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.startExecution(
            command as simStatesCommands.SimStartExecutionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeExecutionCommand",
        async (command, context): Promise<unknown> =>
          await simStepFunctions.describeExecution(
            command as simStatesCommands.SimDescribeExecutionCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Step Functions can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Step Functions
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
