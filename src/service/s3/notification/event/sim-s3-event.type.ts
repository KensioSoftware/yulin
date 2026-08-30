/**
 * The `Records` document an S3 event notification is delivered as.
 *
 * One event produces one record. Real S3 batches nothing for a Lambda
 * destination: a function configured for a Bucket is invoked once per event,
 * with an array holding the single record.
 *
 * This is the document real S3 sends rather than the `aws-lambda` typings
 * package's `S3Event`, and a handler typed against that one has to be given
 * this as an `S3Event` rather than being assignable from it. That package
 * declares `Records` mutable and requires `s3.object.size` and `eTag`, which a
 * removal record does not carry: describing a removal truthfully and
 * satisfying those declarations are not both possible, and the truthful shape
 * is the one worth having.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
 */
export interface SimS3Event {
  readonly Records: readonly SimS3EventRecord[];
}

/**
 * One Object event as an S3 notification record.
 */
export interface SimS3EventRecord {
  readonly eventVersion: string;
  readonly eventSource: "aws:s3";
  readonly awsRegion: string;
  readonly eventTime: string;
  /** The event type without the `s3:` prefix the configuration uses. */
  readonly eventName: string;
  readonly userIdentity: SimS3EventUserIdentity;
  readonly requestParameters: SimS3EventRequestParameters;
  readonly responseElements: SimS3EventResponseElements;
  readonly s3: SimS3EventNotification;
}

/**
 * Whoever a record names: the caller that caused the event, and the Bucket's
 * owner.
 */
export interface SimS3EventUserIdentity {
  readonly principalId: string;
}

export interface SimS3EventRequestParameters {
  readonly sourceIPAddress: string;
}

/**
 * The ids of the request that caused the event, for tracing it with AWS
 * Support.
 */
export interface SimS3EventResponseElements {
  readonly "x-amz-request-id": string;
  readonly "x-amz-id-2": string;
}

/**
 * What the event was about: the notification configuration that selected it,
 * the Bucket, and the Object.
 */
export interface SimS3EventNotification {
  readonly s3SchemaVersion: string;
  readonly configurationId: string;
  readonly bucket: SimS3EventBucket;
  readonly object: SimS3EventObject;
}

export interface SimS3EventBucket {
  readonly name: string;
  readonly ownerIdentity: SimS3EventUserIdentity;
  readonly arn: string;
}

/**
 * The Object an event is about.
 *
 * `size` and `eTag` describe an Object that exists, so a removal record
 * carries neither, as a real S3 removal record does not. `versionId` is
 * carried by a Bucket keeping versions and left out by one that is not. The
 * key is form-URL-encoded, as the record carries it: a space is a plus sign,
 * while the slashes of a key prefix stay as they are.
 */
export interface SimS3EventObject {
  readonly key: string;
  readonly size?: number | undefined;
  readonly eTag?: string | undefined;
  readonly versionId?: string | undefined;
  readonly sequencer: string;
}
