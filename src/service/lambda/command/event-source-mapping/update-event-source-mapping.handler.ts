import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimLambdaResourceInUseException } from "../../error/sim-lambda.error.js";
import type { SimLambdaEventSourcePollers } from "../../event-source/sim-lambda-event-source-pollers.js";
import { simLambdaEventSourceMappingSettled } from "../../event-source/sim-lambda-event-source-mapping-update.js";
import type { SimLambdaEventSourceMappingAccess } from "./event-source-mapping-access.js";
import type {
  SimUpdateEventSourceMappingCommand,
  SimUpdateEventSourceMappingCommandOutput,
} from "./event-source-mapping.command.js";
import { simLambdaEventSourceMappingUpdateOf } from "./update-event-source-mapping-input.js";
import {
  type SimLambdaEventSourceMappingRetargetProperties,
  simLambdaEventSourceMappingTargetOf,
} from "./update-event-source-mapping-target.js";

interface UpdateEventSourceMappingCommandHandlerProperties extends SimLambdaEventSourceMappingRetargetProperties {
  readonly access: SimLambdaEventSourceMappingAccess;
  readonly pollers: SimLambdaEventSourcePollers;
  readonly background: BackgroundScheduler;
}

interface UpdateEventSourceMappingCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda UpdateEventSourceMappingCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateEventSourceMappingCommand/
 *
 * The answer reports the mapping on its way to the change, and the change
 * settles in the background, after which an enabled mapping polls whatever is
 * waiting on its source.
 */
export class UpdateEventSourceMappingCommandHandler {
  private readonly properties: UpdateEventSourceMappingCommandHandlerProperties;

  constructor(properties: UpdateEventSourceMappingCommandHandlerProperties) {
    this.properties = properties;
  }

  /**
   * Change what a mapping delivers, how, and to which function.
   */
  async handle(
    command: SimUpdateEventSourceMappingCommand,
    options?: UpdateEventSourceMappingCommandHandlerOptions,
  ): Promise<SimUpdateEventSourceMappingCommandOutput> {
    const { access, background, pollers } = this.properties;
    await background.sequence();

    const mapping = access.require(
      "lambda:UpdateEventSourceMapping",
      command.input.UUID,
      options?.caller,
    );
    const update = simLambdaEventSourceMappingUpdateOf(
      command.input,
      mapping,
      background.now(),
    );

    if (!simLambdaEventSourceMappingSettled(mapping.state)) {
      throw new SimLambdaResourceInUseException(
        `Cannot update the event source mapping ${mapping.uuid} because it ` +
          `is in use: its state is ${mapping.state}`,
      );
    }

    const target = await simLambdaEventSourceMappingTargetOf(
      this.properties,
      command.input.FunctionName,
      mapping,
      options?.caller,
    );

    // Checking a new function reads the event source, and a delete can land
    // while it does. A mapping deleted by then is not there to update.
    access.require(
      "lambda:UpdateEventSourceMapping",
      command.input.UUID,
      options?.caller,
    );
    mapping.update({ ...update, target });
    pollers.settle(mapping);

    return { $metadata: {}, ...mapping.configuration() };
  }
}
