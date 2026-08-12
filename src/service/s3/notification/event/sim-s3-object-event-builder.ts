import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimS3NotificationEvent } from "../../bucket/notification/sim-s3-notification-event.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3Object } from "../../object/s3-object.js";
import { SimS3ObjectSequencers } from "../sim-s3-object-sequencers.js";
import { simS3EventPrincipalId } from "./sim-s3-event-principal.js";
import { SimS3ObjectEvent } from "./sim-s3-object-event.js";

/**
 * An Object a command has just stored.
 */
export interface SimS3ObjectCreatedInput {
  readonly bucket: SimS3Bucket;
  readonly object: SimS3Object;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * An Object key a command has just removed.
 */
export interface SimS3ObjectRemovedInput {
  readonly bucket: SimS3Bucket;
  readonly key: string;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * Something that happened to an Object, before any Bucket configuration has
 * been consulted about it.
 */
export interface SimS3RaisedObjectEvent {
  readonly bucket: SimS3Bucket;
  readonly eventName: SimS3NotificationEvent;
  readonly key: string;
  readonly caller: SimAwsResolvedCaller;
  readonly size?: number | undefined;
  readonly eTag?: string | undefined;
}

interface SimS3ObjectEventBuilderProperties {
  readonly clock: SimClock;
}

/**
 * Turns something that happened to an Object into the event a destination is
 * offered.
 *
 * The sequence numbers live here because they belong to the event rather than
 * to any destination: every destination configured for one event gets the same
 * one, and a later event on the same key gets a greater one.
 */
export class SimS3ObjectEventBuilder {
  private readonly clock: SimClock;
  private readonly sequencers = new SimS3ObjectSequencers();

  constructor(properties: SimS3ObjectEventBuilderProperties) {
    this.clock = properties.clock;
  }

  /**
   * Build the event for an Object that was stored, which carries the Object's
   * size and ETag.
   */
  forCreated(input: SimS3ObjectCreatedInput): SimS3ObjectEvent {
    return this.build({
      bucket: input.bucket,
      eventName: "s3:ObjectCreated:Put",
      key: input.object.key,
      caller: input.caller,
      size: input.object.body.length,
      eTag: input.object.etag,
    });
  }

  /**
   * Build the event for an Object that was removed, which carries neither size
   * nor ETag, because the Object they described is gone.
   */
  forRemoved(input: SimS3ObjectRemovedInput): SimS3ObjectEvent {
    return this.build({
      bucket: input.bucket,
      eventName: "s3:ObjectRemoved:Delete",
      key: input.key,
      caller: input.caller,
    });
  }

  private build(raised: SimS3RaisedObjectEvent): SimS3ObjectEvent {
    const scope = raised.bucket.getAccountRegionScope();
    const bucketName = raised.bucket.bucketName;

    return new SimS3ObjectEvent({
      eventName: raised.eventName,
      // The simulation's own clock, so a frozen clock produces a fixed time.
      eventTime: this.clock.now(),
      bucketName,
      bucketArn: simS3BucketArn(bucketName),
      regionName: scope.regionName,
      ownerAccountId: scope.accountId,
      principalId: simS3EventPrincipalId(raised.caller),
      key: raised.key,
      sequencer: this.sequencers.next(bucketName, raised.key),
      size: raised.size,
      eTag: raised.eTag,
    });
  }
}
