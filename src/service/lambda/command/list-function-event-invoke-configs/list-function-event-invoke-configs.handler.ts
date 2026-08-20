import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import { simLambdaEventInvokeConfiguration } from "../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import {
  type EventInvokeConfigCommandOptions,
  type EventInvokeConfigCommandProperties,
  EventInvokeConfigRequest,
} from "../event-invoke-config/event-invoke-config-request.js";
import type {
  SimListFunctionEventInvokeConfigsCommand,
  SimListFunctionEventInvokeConfigsCommandOutput,
} from "./list-function-event-invoke-configs.command.js";

interface ListFunctionEventInvokeConfigsCommandHandlerProperties extends EventInvokeConfigCommandProperties {
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
}

/**
 * Simulated Lambda ListFunctionEventInvokeConfigsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionEventInvokeConfigsCommand/
 */
export class ListFunctionEventInvokeConfigsCommandHandler implements CommandHandler<
  SimListFunctionEventInvokeConfigsCommand,
  SimListFunctionEventInvokeConfigsCommandOutput
> {
  private readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore;
  private readonly request: EventInvokeConfigRequest;

  constructor(
    properties: ListFunctionEventInvokeConfigsCommandHandlerProperties,
  ) {
    this.eventInvokeConfigs = properties.eventInvokeConfigs;
    this.request = new EventInvokeConfigRequest({
      ...properties,
      action: "lambda:ListFunctionEventInvokeConfigs",
    });
  }

  /**
   * List every event invoke config a function holds, across its qualifiers.
   */
  async handle(
    command: SimListFunctionEventInvokeConfigsCommand,
    options?: EventInvokeConfigCommandOptions,
  ): Promise<SimListFunctionEventInvokeConfigsCommandOutput> {
    const resolved = await this.request.resolve(
      command.input,
      "ListFunctionEventInvokeConfigsCommand",
      options,
    );

    return {
      $metadata: {},
      FunctionEventInvokeConfigs: this.eventInvokeConfigs
        .allForFunction(resolved.functionName)
        .map(simLambdaEventInvokeConfiguration),
    };
  }
}
