import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./put-object.command.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { PutObjectAuthorizer } from "./put-object-authorizer.js";
import { PutObjectBuilder } from "./put-object-builder.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";

interface PutObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Simulated S3 PutObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
 */
export class PutObjectCommandHandler implements CommandHandler<
  SimPutObjectCommand,
  SimPutObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: PutObjectAuthorizer;
  private readonly objectBuilder: PutObjectBuilder;
  private readonly background: BackgroundScheduler;
  private readonly notifications: SimS3ObjectNotifier;

  constructor(properties: PutObjectCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.buckets = buckets;
    this.authorizer = new PutObjectAuthorizer({ iam });
    this.background = background;
    this.objectBuilder = new PutObjectBuilder({ clock: background });
    this.notifications = properties.notifications;
  }

  /**
   * Simulate putting an Object into an S3 Bucket.
   *
   * Required-input validation and Bucket lookup happen before authorization so
   * malformed requests and missing Buckets retain their S3 error behavior.
   * Authorization happens before request conversion and storage mutation so a
   * denied request cannot process, create, or replace an Object.
   *
   * Once authorization succeeds, PutObjectBuilder translates the SDK request
   * into the storage model. This handler remains responsible for request-level
   * sequencing while body and metadata conversion stay isolated from it.
   */
  async handle(
    command: SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectCommandOutput> {
    assertDefined(command.input.Bucket, "PutObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "PutObjectCommand.input.Key");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const caller = this.authorizer.authorize(
      bucket,
      command.input.Key,
      options,
    );

    const object = this.objectBuilder.build(command);
    await bucket.putObject(object);

    // Every write path funnels through here, so this one call covers the SDK,
    // an intercepted SDK client and the REST endpoint alike.
    this.notifications.objectCreated({ bucket, object, caller });

    return {
      ETag: simS3QuotedETag(object.etag),
      $metadata: {},
    };
  }
}
