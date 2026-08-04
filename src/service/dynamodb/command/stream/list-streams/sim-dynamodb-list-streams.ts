import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbStreamAccess } from "../sim-dynamodb-stream-access.js";
import { SimDynamoDbStreamPage } from "./sim-dynamodb-stream-page.js";
import type {
  SimListStreamsCommand,
  SimListStreamsCommandOutput,
} from "./list-streams.command.js";

interface SimDynamoDbListStreamsProperties {
  readonly access: SimDynamoDbStreamAccess;
}

interface SimDynamoDbListStreamsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The command that lists the streams of this Account and Region.
 *
 * A stream stays listed once its table has switched it off, since a disabled
 * stream is readable for the rest of its retention window and a consumer has to
 * be able to find it.
 */
export class SimDynamoDbListStreams {
  private readonly access: SimDynamoDbStreamAccess;

  constructor(properties: SimDynamoDbListStreamsProperties) {
    this.access = properties.access;
  }

  /**
   * List the streams here, optionally only one table's.
   */
  handle(
    command: SimListStreamsCommand,
    options?: SimDynamoDbListStreamsOptions,
  ): SimListStreamsCommandOutput {
    const streams = this.access.all("dynamodb:ListStreams", options?.caller);
    const page = new SimDynamoDbStreamPage(streams, command.input);

    return {
      Streams: page.streams.map((stream) => ({
        StreamArn: stream.arn,
        TableName: stream.tableName,
        StreamLabel: stream.label,
      })),
      LastEvaluatedStreamArn: page.lastEvaluatedStreamArn,
      $metadata: {},
    };
  }
}
