import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDbStream } from "../../stream/sim-dynamodb-stream.js";
import type { SimDynamoDbStreamStore } from "../../stream/sim-dynamodb-stream-store.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface SimDynamoDbStreamAccessProperties {
  readonly streams: SimDynamoDbStreamStore;
  readonly authorizer: SimDynamoDbAuthorizer;
  readonly clock: SimClock;
}

/**
 * How a Streams command reaches the stream a request names.
 *
 * Every one of them goes through the same three steps in the same order: bring
 * the streams up to date for the retention window, authorize the caller
 * against the ARN the request carries, then look the stream up. Keeping them
 * here is what makes that order the same for all of them, so no command can
 * tell an unauthorized caller which stream ARNs are real.
 */
export class SimDynamoDbStreamAccess {
  private readonly streams: SimDynamoDbStreamStore;
  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly clock: SimClock;

  constructor(properties: SimDynamoDbStreamAccessProperties) {
    this.streams = properties.streams;
    this.authorizer = properties.authorizer;
    this.clock = properties.clock;
  }

  /**
   * Find the stream an ARN names, refusing the caller before looking it up.
   *
   * A request with no `StreamArn` at all is refused before authorization,
   * since there is no resource to authorize it against. Everything past that
   * is authorized first, so an unauthorized caller cannot find out which ARNs
   * name a real stream.
   */
  required(
    action: string,
    streamArn: string | undefined,
    caller: SimAwsCaller | undefined,
  ): SimDynamoDbStream {
    if (streamArn === undefined || streamArn === "") {
      throw new SimDynamoDbValidationException(
        `${action.replace("dynamodb:", "")} requires a StreamArn`,
      );
    }

    this.streams.applyRetention(this.clock.now());
    this.authorizer.authorizeStream(action, streamArn, caller);

    const stream = this.streams.findByArn(streamArn);
    if (stream === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `No DynamoDB Stream with ARN ${streamArn}`,
      );
    }

    return stream;
  }

  /**
   * Every stream in this scope, once the caller is allowed to list them.
   *
   * ListStreams names no stream, so it authorizes the way ListTables does:
   * against every resource, and without filtering the answer by what the caller
   * could go on to read.
   */
  all(
    action: string,
    caller: SimAwsCaller | undefined,
  ): readonly SimDynamoDbStream[] {
    this.streams.applyRetention(this.clock.now());
    this.authorizer.authorizeAnyTable(action, caller);

    return this.streams.inArnOrder();
  }
}
