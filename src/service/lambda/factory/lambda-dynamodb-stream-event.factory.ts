import { faker } from "@faker-js/faker";
import { DynamicFactory, type ItemFactory } from "@kensio/part-factory";

import { SimRecordsEventFactory } from "../../../util/factory/sim-records-event.factory.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import type {
  SimLambdaDynamoDbStreamEvent,
  SimLambdaDynamoDbStreamEventRecord,
} from "../event-source/poll/sim-lambda-dynamodb-stream-event.types.js";
import {
  type StreamRecordChange,
  streamRecordChange,
} from "./lambda-dynamodb-stream-record-change.js";

const millisecondsPerSecond = 1000;

/**
 * The stream a made record comes from when a test does not name one.
 *
 * A stream ARN is a table ARN with a label after it, and real DynamoDB makes
 * the label the instant the stream was enabled.
 *
 * Built when a record is made rather than when this module loads: the Account
 * and Region defaults come from modules that reach this one back through the
 * service index, and reading them at load time would read them before they
 * exist.
 */
function defaultStreamArn(): string {
  return (
    `arn:aws:dynamodb:${DEFAULT_SIM_AWS_REGION_NAME}:${DEFAULT_SIM_AWS_ACCOUNT_ID}` +
    `:table/orders/stream/2026-01-01T00:00:00.000`
  );
}

/**
 * Makes the records of a DynamoDB stream event, one change each.
 *
 * A test that cares about the change and nothing else says only that:
 *
 * ```typescript
 * lambdaDynamoDbStreamEventRecordFactory.make({
 *   eventName: "MODIFY",
 *   dynamodb: { NewImage: { status: { S: "shipped" } } },
 * });
 * ```
 *
 * What a real record says in more than one place is computed from the rest, so
 * a record is one a stream could have delivered:
 *
 * - the images match the `eventName`: an `INSERT` carries a new image, a
 *   `REMOVE` an old one, and a `MODIFY` both, alongside the keys
 * - `StreamViewType` names the images the record actually carries, including
 *   any the test added
 * - `awsRegion` is the Region of the stream ARN given
 *
 * The casing is the event's own rather than a scheme: `eventID` has a capital
 * ID, `eventSourceARN` a capital ARN, `dynamodb` none, and the block inside it
 * is capitalized. All of it is what a function receives.
 *
 * `SizeBytes` is a plausible default rather than a measurement of the images
 * given, so a test asserting on it should say what it expects.
 */
export const lambdaDynamoDbStreamEventRecordFactory =
  new DynamicFactory<SimLambdaDynamoDbStreamEventRecord>((overrides = {}) => {
    const eventSourceArn = overrides.eventSourceARN ?? defaultStreamArn();
    const change: StreamRecordChange = streamRecordChange(overrides);

    return {
      eventID: faker.string.hexadecimal({
        length: 32,
        casing: "lower",
        prefix: "",
      }),
      eventName: change.eventName,
      eventVersion: "1.1",
      eventSource: "aws:dynamodb",
      awsRegion: streamArnRegion(eventSourceArn),
      dynamodb: {
        ApproximateCreationDateTime: Math.floor(
          Date.now() / millisecondsPerSecond,
        ),
        ...change.images,
        SequenceNumber: "100000000000000000000",
        SizeBytes: 64,
        StreamViewType: change.streamViewType,
      },
      eventSourceARN: eventSourceArn,
    };
  });

/**
 * Makes the event a DynamoDB stream event source mapping invokes a function
 * with.
 *
 * The default is the single-record batch a stream delivers when one item has
 * changed. A batch is the records a test asks for, each completed by
 * `lambdaDynamoDbStreamEventRecordFactory`:
 *
 * ```typescript
 * lambdaDynamoDbStreamEventFactory.make({
 *   Records: [{ eventName: "INSERT" }, { eventName: "REMOVE" }],
 * });
 * ```
 */
export const lambdaDynamoDbStreamEventFactory: ItemFactory<SimLambdaDynamoDbStreamEvent> =
  new SimRecordsEventFactory(lambdaDynamoDbStreamEventRecordFactory);

/**
 * The Region a DynamoDB stream ARN names, which is the Region its records
 * report.
 */
function streamArnRegion(streamArn: string): string {
  return streamArn.split(":", 4)[3] ?? DEFAULT_SIM_AWS_REGION_NAME;
}
