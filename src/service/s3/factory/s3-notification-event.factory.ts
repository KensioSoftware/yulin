import { faker } from "@faker-js/faker";
import { DynamicFactory, type ItemFactory } from "@kensio/part-factory";

import { SimRecordsEventFactory } from "../../../util/factory/sim-records-event.factory.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../aws/sim-aws-region.js";
import {
  SIM_S3_EVENT_SCHEMA_VERSION,
  SIM_S3_EVENT_VERSION,
  simS3EventRequestId,
  simS3EventSourceIpAddress,
} from "../notification/event/sim-s3-event-records.js";
import type {
  SimS3Event,
  SimS3EventObject,
  SimS3EventRecord,
} from "../notification/event/sim-s3-event.type.js";
import { simS3ObjectExists } from "./s3-notification-event-object.js";

const defaultBucketName = "uploads";
const defaultKey = "orders/YL-1.json";

/**
 * Makes the records of an S3 event notification, one Object event each.
 *
 * A test that cares about which Object changed says only that:
 *
 * ```typescript
 * s3NotificationEventRecordFactory.make({
 *   s3: { object: { key: "orders/YL-9.json" } },
 * });
 * ```
 *
 * What a real record says in more than one place is computed from the rest, so
 * a record is one S3 could have delivered:
 *
 * - the Bucket ARN is the ARN of the Bucket named
 * - a removal carries no `size` and no `eTag`, because the Object it reports
 *   no longer exists, while a creation carries both
 *
 * The key is carried as a record carries it, form-URL-encoded, so a key with a
 * space in it goes in as `my+file.txt`. `principalId` is an ARN rather than
 * the `AIDA...` form real S3 reports, which is what simulated S3 delivers and
 * what a test would assert on.
 */
export const s3NotificationEventRecordFactory =
  new DynamicFactory<SimS3EventRecord>((overrides = {}) => {
    const notification = overrides.s3 ?? {};
    const bucketName = notification.bucket?.name ?? defaultBucketName;
    const eventName = overrides.eventName ?? "ObjectCreated:Put";

    return {
      eventVersion: SIM_S3_EVENT_VERSION,
      eventSource: "aws:s3",
      awsRegion: DEFAULT_SIM_AWS_REGION_NAME,
      eventTime: new Date().toISOString(),
      eventName,
      userIdentity: { principalId: "anonymous" },
      requestParameters: { sourceIPAddress: simS3EventSourceIpAddress },
      responseElements: {
        "x-amz-request-id": simS3EventRequestId(),
        "x-amz-id-2": simS3EventRequestId(),
      },
      s3: {
        s3SchemaVersion: SIM_S3_EVENT_SCHEMA_VERSION,
        configurationId: "yulin-notification",
        bucket: {
          name: bucketName,
          ownerIdentity: { principalId: "anonymous" },
          arn: `arn:aws:s3:::${bucketName}`,
        },
        object: eventObject(eventName),
      },
    };
  });

/**
 * Makes the event notification a Bucket delivers to a function.
 *
 * The default is the single record one Object event produces, which is all
 * real S3 ever delivers to a function at once. A test wanting more than one
 * says what each is about, and each is completed by
 * `s3NotificationEventRecordFactory`:
 *
 * ```typescript
 * s3NotificationEventFactory.make({
 *   Records: [
 *     { s3: { object: { key: "orders/YL-1.json" } } },
 *     { eventName: "ObjectRemoved:Delete" },
 *   ],
 * });
 * ```
 */
export const s3NotificationEventFactory: ItemFactory<SimS3Event> =
  new SimRecordsEventFactory(s3NotificationEventRecordFactory);

/**
 * The Object a record reports, described as it can be for the event reported.
 */
function eventObject(eventName: string): SimS3EventObject {
  // Sixteen upper-case hexadecimal digits, the width simulated S3 hands out,
  // so a test comparing two sequencers as text orders them.
  const sequencer = faker.string.hexadecimal({
    length: 16,
    casing: "upper",
    prefix: "",
  });

  return {
    key: defaultKey,
    ...(simS3ObjectExists(eventName) && {
      size: 1024,
      eTag: faker.string.hexadecimal({
        length: 32,
        casing: "lower",
        prefix: "",
      }),
    }),
    sequencer,
  };
}
