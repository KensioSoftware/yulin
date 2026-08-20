import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectNotifier } from "../../notification/sim-s3-object-notifier.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import { GetObjectAuthorizer } from "../get-object/get-object-authorizer.js";
import { PutObjectAuthorizer } from "../put-object/put-object-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { CopyObjectBuilder } from "./copy-object-builder.js";
import {
  simS3CopySource,
  simS3CopySourceObject,
  simS3RefuseUnchangedSelfCopy,
} from "./copy-object-source.js";
import type {
  SimCopyObjectCommand,
  SimCopyObjectCommandOutput,
} from "./copy-object.command.js";

interface CopyObjectCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notifications: SimS3ObjectNotifier;
}

/**
 * Simulated S3 CopyObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CopyObjectCommand/
 */
export class CopyObjectCommandHandler implements CommandHandler<
  SimCopyObjectCommand,
  SimCopyObjectCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly sourceAuthorizer: GetObjectAuthorizer;
  private readonly destinationAuthorizer: PutObjectAuthorizer;
  private readonly objectBuilder: CopyObjectBuilder;
  private readonly background: BackgroundScheduler;
  private readonly notifications: SimS3ObjectNotifier;

  constructor(properties: CopyObjectCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.sourceAuthorizer = new GetObjectAuthorizer({ iam });
    this.destinationAuthorizer = new PutObjectAuthorizer({ iam });
    this.background = background;
    this.objectBuilder = new CopyObjectBuilder({ clock: background });
    this.notifications = properties.notifications;
  }

  /**
   * Simulate copying one S3 Object to another.
   *
   * A copy is a read and a write in one request, and it authorizes as both.
   * `s3:GetObject` on the source and `s3:PutObject` on the destination are
   * separate decisions against separate Bucket policies. A caller holding one
   * and not the other is refused.
   *
   * Both Buckets are found and the request checked for sense before either
   * decision. That keeps a malformed request and a missing Bucket answering
   * what real S3 answers. The source Object is read after authorization, which
   * leaves a refused caller knowing nothing about which keys exist.
   */
  async handle(
    command: SimCopyObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCopyObjectCommandOutput> {
    assertDefined(command.input.Bucket, "CopyObjectCommand.input.Bucket");
    assertDefined(command.input.Key, "CopyObjectCommand.input.Key");
    assertDefined(
      command.input.CopySource,
      "CopyObjectCommand.input.CopySource",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const key = command.input.Key;
    const destination = requireSimS3Bucket(this.buckets, bucketName);
    const from = simS3CopySource(command.input.CopySource);
    const source = requireSimS3Bucket(this.buckets, from.bucketName);

    simS3RefuseUnchangedSelfCopy(
      from,
      { bucketName, key },
      command.input.MetadataDirective,
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.sourceAuthorizer.authorize(source, from.key, options);
    const caller = this.destinationAuthorizer.authorize(
      destination,
      key,
      options,
    );

    const stored = await simS3CopySourceObject(source, from.key);
    const object = this.objectBuilder.build(command.input, key, stored);
    await destination.putObject(object);

    this.notifications.objectCreated({
      bucket: destination,
      object,
      caller,
      eventName: "s3:ObjectCreated:Copy",
    });

    return {
      CopyObjectResult: {
        ETag: simS3QuotedETag(object.etag),
        LastModified: object.lastModified,
      },
      $metadata: {},
    };
  }
}
