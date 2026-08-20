import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import { simLambdaEventInvokeConfiguration } from "../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import {
  type EventInvokeConfigCommandOptions,
  type EventInvokeConfigCommandProperties,
  EventInvokeConfigRequest,
} from "../event-invoke-config/event-invoke-config-request.js";
import { EventInvokeConfigInputParser } from "../event-invoke-config/event-invoke-config-input.js";
import type {
  SimUpdateFunctionEventInvokeConfigCommand,
  SimUpdateFunctionEventInvokeConfigCommandOutput,
} from "./update-function-event-invoke-config.command.js";

interface UpdateFunctionEventInvokeConfigCommandHandlerProperties extends EventInvokeConfigCommandProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
}

/**
 * Simulated Lambda UpdateFunctionEventInvokeConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionEventInvokeConfigCommand/
 */
export class UpdateFunctionEventInvokeConfigCommandHandler implements CommandHandler<
  SimUpdateFunctionEventInvokeConfigCommand,
  SimUpdateFunctionEventInvokeConfigCommandOutput
> {
  private readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  private readonly request: EventInvokeConfigRequest;

  private readonly inputParser = new EventInvokeConfigInputParser();

  constructor(
    properties: UpdateFunctionEventInvokeConfigCommandHandlerProperties,
  ) {
    this.eventInvokeConfigs = properties.eventInvokeConfigs;
    this.request = new EventInvokeConfigRequest({
      ...properties,
      action: "lambda:UpdateFunctionEventInvokeConfig",
    });
  }

  /**
   * Change the settings a request named, leaving the rest of the config as it
   * stands.
   */
  async handle(
    command: SimUpdateFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimUpdateFunctionEventInvokeConfigCommandOutput> {
    const resolved = await this.request.resolve(
      command.input,
      "UpdateFunctionEventInvokeConfigCommand",
      options,
    );
    const config = this.eventInvokeConfigs.update({
      ...resolved,
      update: this.inputParser.parse(command.input),
    });

    return { $metadata: {}, ...simLambdaEventInvokeConfiguration(config) };
  }
}
