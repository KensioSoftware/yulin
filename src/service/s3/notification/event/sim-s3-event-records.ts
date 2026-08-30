import { randomUUID } from "node:crypto";
import type { SimS3Event } from "./sim-s3-event.type.js";
import type { SimS3ObjectEvent } from "./sim-s3-object-event.js";

/**
 * The event structure version this simulator emits.
 *
 * AWS increments the minor version whenever it adds a field or an event type,
 * and the major version only for a change that breaks a consumer. Consumers
 * are advised to compare the major for equality and treat the minor as a floor,
 * so a test should assert on the major rather than on this whole string.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
 */
export const SIM_S3_EVENT_VERSION = "2.5";

/**
 * The event schema version inside the `s3` block, which is separate from the
 * message version and has not moved off 1.0.
 */
export const SIM_S3_EVENT_SCHEMA_VERSION = "1.0";

/**
 * The `Records` document a destination receives for one Object event.
 *
 * One event produces one record. Real S3 batches nothing for a Lambda
 * destination either: a function configured for a Bucket is invoked once per
 * event, with an array holding the single record.
 */
export function simS3EventRecordsDocument(
  event: SimS3ObjectEvent,
  configurationId: string,
): SimS3Event {
  return {
    Records: [
      {
        eventVersion: SIM_S3_EVENT_VERSION,
        eventSource: "aws:s3",
        awsRegion: event.regionName,
        eventTime: event.eventTime.toISOString(),
        // The record names the event type without the "s3:" prefix the
        // configuration uses.
        eventName: event.eventName.replace("s3:", ""),
        userIdentity: { principalId: event.principalId },
        requestParameters: { sourceIPAddress: simS3EventSourceIpAddress },
        responseElements: {
          "x-amz-request-id": simS3EventRequestId(),
          "x-amz-id-2": simS3EventRequestId(),
        },
        s3: {
          s3SchemaVersion: SIM_S3_EVENT_SCHEMA_VERSION,
          configurationId,
          bucket: {
            name: event.bucketName,
            ownerIdentity: { principalId: event.ownerAccountId },
            arn: event.bucketArn,
          },
          object: {
            key: simS3EventObjectKey(event.key),
            ...(event.size !== undefined && { size: event.size }),
            ...(event.eTag !== undefined && { eTag: event.eTag }),
            ...(event.versionId !== undefined && {
              versionId: event.versionId,
            }),
            sequencer: event.sequencer,
          },
        },
      },
    ],
  };
}

/**
 * The address a simulated request came from.
 *
 * A request to simulated S3 is made in this process, so the loopback address
 * is the honest answer. A test asserting on it is asserting on the simulator
 * rather than on anything AWS would report, which is why the Limitations
 * section says so.
 */
export const simS3EventSourceIpAddress = "127.0.0.1";

/**
 * A request id for one event.
 *
 * Real S3 puts the ids of the request that caused the event here, so AWS
 * Support can trace it. The simulator has no such ids, so these are generated
 * per event and match nothing: they are present because the field is, not
 * because they mean anything.
 */
export function simS3EventRequestId(): string {
  return randomUUID().replaceAll("-", "").toUpperCase();
}

/**
 * The object key as a record carries it.
 *
 * Real S3 form-URL-encodes the key, so a space becomes a plus sign, while the
 * slashes that make up a key prefix stay as they are.
 */
export function simS3EventObjectKey(key: string): string {
  return encodeURIComponent(key).replaceAll("%20", "+").replaceAll("%2F", "/");
}
