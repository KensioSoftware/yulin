import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbTimeToLiveSpecification } from "../../time-to-live/sim-dynamodb-time-to-live-specification.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimDescribeTimeToLiveCommand,
  SimDescribeTimeToLiveCommandOutput,
  SimUpdateTimeToLiveCommand,
  SimUpdateTimeToLiveCommandOutput,
} from "./time-to-live.command.js";

interface SimDynamoDbTimeToLiveCommandsProperties {
  readonly access: SimDynamoDbTableAccess;
  readonly background: BackgroundScheduler;
}

interface SimDynamoDbTimeToLiveCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that switch a table's time to live on and off, and report it.
 */
export class SimDynamoDbTimeToLiveCommands {
  private readonly access: SimDynamoDbTableAccess;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimDynamoDbTimeToLiveCommandsProperties) {
    this.access = properties.access;
    this.background = properties.background;
  }

  /**
   * Switch a table's time to live on or off.
   *
   * The status goes to ENABLING or DISABLING at once and settles once the
   * background work has run, which is the sequence real DynamoDB goes through.
   * The response carries the specification the request gave, as AWS answers
   * while the change is still in progress.
   */
  updateTimeToLive(
    command: SimUpdateTimeToLiveCommand,
    options?: SimDynamoDbTimeToLiveCommandsOptions,
  ): SimUpdateTimeToLiveCommandOutput {
    const table = this.access.required(
      "dynamodb:UpdateTimeToLive",
      command.input.TableName,
      options?.caller,
    );
    const specification = SimDynamoDbTimeToLiveSpecification.fromInput(
      command.input.TimeToLiveSpecification,
    );

    table.timeToLive.update(specification, this.background.now());
    this.background.schedule(() => table.timeToLive.settle());

    return {
      TimeToLiveSpecification: {
        AttributeName: specification.attributeName,
        Enabled: specification.enabled,
      },
      $metadata: {},
    };
  }

  /**
   * Report a table's time to live.
   */
  describeTimeToLive(
    command: SimDescribeTimeToLiveCommand,
    options?: SimDynamoDbTimeToLiveCommandsOptions,
  ): SimDescribeTimeToLiveCommandOutput {
    const table = this.access.required(
      "dynamodb:DescribeTimeToLive",
      command.input.TableName,
      options?.caller,
    );

    return {
      TimeToLiveDescription: table.timeToLive.description(),
      $metadata: {},
    };
  }
}
