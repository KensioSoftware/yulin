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

interface UpdateEventSourceMappingCommandHandlerProperties {
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
   * Change a mapping's batch size, enabled state or filters.
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

    mapping.update(update);
    pollers.settle(mapping);

    return { $metadata: {}, ...mapping.configuration() };
  }
}
