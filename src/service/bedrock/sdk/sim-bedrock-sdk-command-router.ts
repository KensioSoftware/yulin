import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimConverseStreamCommand } from "../command/converse/converse-stream.command.js";
import type { SimConverseCommand } from "../command/converse/converse.command.js";
import type {
  SimInvokeModelCommand,
  SimInvokeModelWithResponseStreamCommand,
} from "../command/invoke-model/invoke-model.command.js";
import type { SimBedrock } from "../sim-bedrock.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Bedrock.
 *
 * An intercepted `BedrockRuntimeClient` reports the `Bedrock Runtime` service
 * id, which is where the invocation commands arrive from.
 */
export class SimBedrockSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simBedrock: SimBedrock) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "ConverseCommand",
        async (command, context): Promise<unknown> =>
          await simBedrock.converse(
            command as SimConverseCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ConverseStreamCommand",
        async (command, context): Promise<unknown> =>
          await simBedrock.converseStream(
            command as SimConverseStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "InvokeModelCommand",
        async (command, context): Promise<unknown> =>
          await simBedrock.invokeModel(
            command as SimInvokeModelCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "InvokeModelWithResponseStreamCommand",
        async (command, context): Promise<unknown> =>
          await simBedrock.invokeModelWithResponseStream(
            command as SimInvokeModelWithResponseStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Bedrock can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Bedrock supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
