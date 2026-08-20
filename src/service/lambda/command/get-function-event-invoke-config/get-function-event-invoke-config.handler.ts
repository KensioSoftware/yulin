import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import { simLambdaEventInvokeConfiguration } from "../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import {
  type EventInvokeConfigCommandOptions,
  type EventInvokeConfigCommandProperties,
  EventInvokeConfigRequest,
} from "../event-invoke-config/event-invoke-config-request.js";
import type {
  SimGetFunctionEventInvokeConfigCommand,
  SimGetFunctionEventInvokeConfigCommandOutput,
} from "./get-function-event-invoke-config.command.js";

interface GetFunctionEventInvokeConfigCommandHandlerProperties extends EventInvokeConfigCommandProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
}

/**
 * Simulated Lambda GetFunctionEventInvokeConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionEventInvokeConfigCommand/
 */
export class GetFunctionEventInvokeConfigCommandHandler implements CommandHandler<
  SimGetFunctionEventInvokeConfigCommand,
  SimGetFunctionEventInvokeConfigCommandOutput
> {
  private readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  private readonly request: EventInvokeConfigRequest;

  constructor(
    properties: GetFunctionEventInvokeConfigCommandHandlerProperties,
  ) {
    this.eventInvokeConfigs = properties.eventInvokeConfigs;
    this.request = new EventInvokeConfigRequest({
      ...properties,
      action: "lambda:GetFunctionEventInvokeConfig",
    });
  }

  /**
   * Read a function's event invoke config.
   */
  async handle(
    command: SimGetFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimGetFunctionEventInvokeConfigCommandOutput> {
    const resolved = await this.request.resolve(
      command.input,
      "GetFunctionEventInvokeConfigCommand",
      options,
    );
    const config = this.eventInvokeConfigs.require(
      resolved,
      resolved.functionArn,
    );

    return { $metadata: {}, ...simLambdaEventInvokeConfiguration(config) };
  }
}
