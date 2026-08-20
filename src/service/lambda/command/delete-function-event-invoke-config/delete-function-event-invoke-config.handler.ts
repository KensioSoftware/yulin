import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import {
  type EventInvokeConfigCommandOptions,
  type EventInvokeConfigCommandProperties,
  EventInvokeConfigRequest,
} from "../event-invoke-config/event-invoke-config-request.js";
import type {
  SimDeleteFunctionEventInvokeConfigCommand,
  SimDeleteFunctionEventInvokeConfigCommandOutput,
} from "./delete-function-event-invoke-config.command.js";

interface DeleteFunctionEventInvokeConfigCommandHandlerProperties extends EventInvokeConfigCommandProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
}

/**
 * Simulated Lambda DeleteFunctionEventInvokeConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionEventInvokeConfigCommand/
 */
export class DeleteFunctionEventInvokeConfigCommandHandler implements CommandHandler<
  SimDeleteFunctionEventInvokeConfigCommand,
  SimDeleteFunctionEventInvokeConfigCommandOutput
> {
  private readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  private readonly request: EventInvokeConfigRequest;

  constructor(
    properties: DeleteFunctionEventInvokeConfigCommandHandlerProperties,
  ) {
    this.eventInvokeConfigs = properties.eventInvokeConfigs;
    this.request = new EventInvokeConfigRequest({
      ...properties,
      action: "lambda:DeleteFunctionEventInvokeConfig",
    });
  }

  /**
   * Delete a function's event invoke config, so its asynchronous invocations
   * go back to the defaults.
   */
  async handle(
    command: SimDeleteFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimDeleteFunctionEventInvokeConfigCommandOutput> {
    const resolved = await this.request.resolve(
      command.input,
      "DeleteFunctionEventInvokeConfigCommand",
      options,
    );
    this.eventInvokeConfigs.delete(resolved, resolved.functionArn);

    return { $metadata: {} };
  }
}
