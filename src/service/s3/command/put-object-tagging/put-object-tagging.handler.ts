import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimS3ObjectTagSet } from "../../object/s3-object-tags.js";
import {
  SimS3ObjectTaggingAccess,
  type SimS3ObjectTaggingAccessProperties,
} from "../tagging/sim-s3-object-tagging-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimPutObjectTaggingCommand,
  SimPutObjectTaggingCommandOutput,
} from "./put-object-tagging.command.js";

/**
 * Simulated S3 PutObjectTaggingCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectTaggingCommand/
 */
export class PutObjectTaggingCommandHandler implements CommandHandler<
  SimPutObjectTaggingCommand,
  SimPutObjectTaggingCommandOutput
> {
  private readonly access: SimS3ObjectTaggingAccess;

  constructor(properties: SimS3ObjectTaggingAccessProperties) {
    this.access = new SimS3ObjectTaggingAccess(properties);
  }

  /**
   * Replace the tags on an Object, or on the version the request named.
   *
   * Real S3 puts the whole tag set rather than adding to it, so a request
   * naming one tag leaves the Object carrying that tag alone. The set is read
   * before anything is written, which is what refuses eleven tags without
   * leaving ten of them on the Object.
   */
  async handle(
    command: SimPutObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectTaggingCommandOutput> {
    const tags = SimS3ObjectTagSet.from(
      command.input.Tagging?.TagSet ?? [],
      "PutObjectTaggingCommand",
    );

    const { bucket, taggable, caller } = await this.access.reach(
      {
        commandName: "PutObjectTaggingCommand",
        action: "s3:PutObjectTagging",
        input: command.input,
      },
      options,
    );

    const object = await taggable.retag(tags);

    this.access.notifications.objectTagged({
      bucket,
      object,
      caller,
      eventName: "s3:ObjectTagging:Put",
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
