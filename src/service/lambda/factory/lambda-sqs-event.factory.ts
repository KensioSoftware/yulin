import { faker } from "@faker-js/faker";
import { DynamicFactory, type ItemFactory } from "@kensio/part-factory";

import { makeSimSqsReceiptHandle } from "../../sqs/message/sim-sqs-receipt-handle.js";
import { simSqsBodyDigest } from "../../sqs/message/sim-sqs-message-body.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import { SimRecordsEventFactory } from "../../../util/factory/sim-records-event.factory.js";
import type {
  SimLambdaSqsEvent,
  SimLambdaSqsEventRecord,
} from "../event-source/poll/sim-lambda-sqs-event.js";

/**
 * The queue a made record comes from when a test does not name one.
 *
 * Built when a record is made rather than when this module loads: the Account
 * and Region defaults come from modules that reach this one back through the
 * service index, and reading them at load time would read them before they
 * exist.
 */
function defaultQueueArn(): string {
  return `arn:aws:sqs:${DEFAULT_SIM_AWS_REGION_NAME}:${DEFAULT_SIM_AWS_ACCOUNT_ID}:orders`;
}

/**
 * Makes the records of an SQS event, one message each.
 *
 * A test that cares about one message and nothing else says only that:
 *
 * ```typescript
 * lambdaSqsEventRecordFactory.make({ body: '{"orderId":"YL-1"}' });
 * ```
 *
 * Two fields a real record repeats are computed from the rest, so supplying
 * one settles the other: `md5OfBody` is the digest of the body given, which is
 * what a handler checking the digest compares against, and `awsRegion` is the
 * Region of the queue ARN given.
 *
 * The system `attributes` are the three a simulated mapping delivers, for a
 * message received once, just sent. They keep the SQS names, capital and all,
 * while the record's own fields are lower-case, because that is what a function
 * receives.
 */
export const lambdaSqsEventRecordFactory =
  new DynamicFactory<SimLambdaSqsEventRecord>((overrides = {}) => {
    const body = overrides.body ?? '{"orderId":"YL-1"}';
    const eventSourceArn = overrides.eventSourceARN ?? defaultQueueArn();
    const sentAt = String(Date.now());

    return {
      messageId: faker.string.uuid(),
      receiptHandle: makeSimSqsReceiptHandle(),
      body,
      attributes: {
        ApproximateReceiveCount: "1",
        ApproximateFirstReceiveTimestamp: sentAt,
        SentTimestamp: sentAt,
      },
      messageAttributes: {},
      md5OfBody: simSqsBodyDigest(body),
      eventSource: "aws:sqs",
      eventSourceARN: eventSourceArn,
      awsRegion: queueArnRegion(eventSourceArn),
    };
  });

/**
 * Makes the event an SQS event source mapping invokes a function with.
 *
 * The default is the single-message batch a queue delivers when nothing is
 * backed up. A batch is the records a test asks for, each completed by
 * `lambdaSqsEventRecordFactory`:
 *
 * ```typescript
 * lambdaSqsEventFactory.make({
 *   Records: [{ body: "first" }, { body: "second" }],
 * });
 * ```
 */
export const lambdaSqsEventFactory: ItemFactory<SimLambdaSqsEvent> =
  new SimRecordsEventFactory(lambdaSqsEventRecordFactory);

/**
 * The Region an SQS queue ARN names, which is the Region its records report.
 */
function queueArnRegion(queueArn: string): string {
  return queueArn.split(":", 4)[3] ?? DEFAULT_SIM_AWS_REGION_NAME;
}
