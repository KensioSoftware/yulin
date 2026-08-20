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
  SimPutFunctionEventInvokeConfigCommand,
  SimPutFunctionEventInvokeConfigCommandOutput,
} from "./put-function-event-invoke-config.command.js";

interface PutFunctionEventInvokeConfigCommandHandlerProperties extends EventInvokeConfigCommandProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
}

/**
 * Simulated Lambda PutFunctionEventInvokeConfigCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PutFunctionEventInvokeConfigCommand/
 */
export class PutFunctionEventInvokeConfigCommandHandler implements CommandHandler<
  SimPutFunctionEventInvokeConfigCommand,
  SimPutFunctionEventInvokeConfigCommandOutput
> {
  private readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  private readonly request: EventInvokeConfigRequest;

  private readonly inputParser = new EventInvokeConfigInputParser();

  constructor(
    properties: PutFunctionEventInvokeConfigCommandHandlerProperties,
  ) {
    this.eventInvokeConfigs = properties.eventInvokeConfigs;
    this.request = new EventInvokeConfigRequest({
      ...properties,
      action: "lambda:PutFunctionEventInvokeConfig",
    });
  }

  /**
   * Write a function's whole event invoke config, replacing any it had.
   */
  async handle(
    command: SimPutFunctionEventInvokeConfigCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimPutFunctionEventInvokeConfigCommandOutput> {
    const resolved = await this.request.resolve(
      command.input,
      "PutFunctionEventInvokeConfigCommand",
      options,
    );
    const config = this.eventInvokeConfigs.put({
      ...resolved,
      update: this.inputParser.parse(command.input),
    });

    return { $metadata: {}, ...simLambdaEventInvokeConfiguration(config) };
  }
}
