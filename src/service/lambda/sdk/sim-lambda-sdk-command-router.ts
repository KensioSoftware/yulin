import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreateFunctionCommand } from "../command/create-function/create-function.command.js";
import type { SimGetFunctionCommand } from "../command/get-function/get-function.command.js";
import type { SimInvokeCommand } from "../command/invoke/invoke.command.js";
import type { SimLambda } from "../sim-lambda.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Lambda instance.
 */
export class SimLambdaSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simLambda: SimLambda) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.createFunction(
            command as SimCreateFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetFunctionCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.getFunction(
            command as SimGetFunctionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "InvokeCommand",
        async (command, context): Promise<unknown> =>
          await simLambda.invoke(
            command as SimInvokeCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Lambda can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Lambda supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
