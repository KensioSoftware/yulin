import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import type { SimS3TaggableObject } from "../../bucket/tagging/sim-s3-taggable-object.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import {
  type SimS3ObjectTaggingAction,
  SimS3ObjectTaggingAuthorizer,
} from "./sim-s3-object-tagging-authorizer.js";

export interface SimS3ObjectTaggingAccessProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * The members every tagging request states, alongside the IAM action it is
 * granted by and the command name to report a missing member against.
 */
export interface SimS3TaggingRequest {
  readonly commandName: string;
  readonly action: SimS3ObjectTaggingAction;
  readonly input: {
    readonly Bucket?: string | undefined;
    readonly Key?: string | undefined;
    readonly VersionId?: string | undefined;
  };
}

/**
 * What a tagging request names once it has been allowed.
 */
interface SimS3ReachedObject {
  readonly bucket: SimS3Bucket;
  readonly taggable: SimS3TaggableObject;
  readonly caller: SimAwsResolvedCaller;
}

/**
 * Getting at the tags on an Object, with permission.
 *
 * The three tagging operations share the whole of their preamble: read the
 * Bucket and key the request has to state, find the Bucket or answer
 * NoSuchBucket, let the background scheduler order the request, authorize it
 * under the action that operation is granted by, and find the Object or the
 * version it names. Holding that here leaves each handler with the one thing it
 * actually does to the tags.
 */
export class SimS3ObjectTaggingAccess {
  public readonly notifications: SimS3ObjectNotifier;

  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3ObjectTaggingAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimS3ObjectTaggingAccessProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3ObjectTaggingAuthorizer({ iam });
    this.background = background;
    this.notifications = properties.notifications;
  }

  /**
   * Find and authorize the Object a tagging request names.
   *
   * The Bucket is looked up before authorization so a request against a Bucket
   * that is not there keeps S3's error, and the Object is read after it, which
   * leaves a refused caller knowing nothing about which keys exist.
   */
  async reach(
    request: SimS3TaggingRequest,
    options?: SimS3RequestOptions,
  ): Promise<SimS3ReachedObject> {
    const { Bucket, Key, VersionId } = request.input;
    assertDefined(Bucket, `${request.commandName}.input.Bucket`);
    assertDefined(Key, `${request.commandName}.input.Key`);

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const caller = this.authorizer.authorize(
      request.action,
      bucket,
      Key,
      options,
    );

    return {
      bucket,
      taggable: await bucket.taggableObject(Key, VersionId),
      caller,
    };
  }
}
