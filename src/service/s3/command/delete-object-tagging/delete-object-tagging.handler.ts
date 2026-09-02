import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimS3ObjectTagSet } from "../../object/s3-object-tags.js";
import {
  SimS3ObjectTaggingAccess,
  type SimS3ObjectTaggingAccessProperties,
} from "../tagging/sim-s3-object-tagging-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimDeleteObjectTaggingCommand,
  SimDeleteObjectTaggingCommandOutput,
} from "./delete-object-tagging.command.js";

/**
 * Simulated S3 DeleteObjectTaggingCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteObjectTaggingCommand/
 */
export class DeleteObjectTaggingCommandHandler implements CommandHandler<
  SimDeleteObjectTaggingCommand,
  SimDeleteObjectTaggingCommandOutput
> {
  private readonly access: SimS3ObjectTaggingAccess;

  constructor(properties: SimS3ObjectTaggingAccessProperties) {
    this.access = new SimS3ObjectTaggingAccess(properties);
  }

  /**
   * Take every tag off an Object, or off the version the request named.
   *
   * Real S3 removes the whole tag set and answers the same way whether or not
   * the Object was carrying one, so an Object nobody had tagged is not an
   * error. The event is raised either way, because the request is what real S3
   * raises it for.
   */
  async handle(
    command: SimDeleteObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteObjectTaggingCommandOutput> {
    const { bucket, taggable, caller } = await this.access.reach(
      {
        commandName: "DeleteObjectTaggingCommand",
        action: "s3:DeleteObjectTagging",
        input: command.input,
      },
      options,
    );

    const object = await taggable.retag(SimS3ObjectTagSet.empty());

    this.access.notifications.objectTagged({
      bucket,
      object,
      caller,
      eventName: "s3:ObjectTagging:Delete",
      versionId: taggable.versionId,
    });

    return {
      ...(taggable.versionId !== undefined && {
        VersionId: taggable.versionId,
      }),
      $metadata: {},
    };
  }
}
