import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  SimS3ObjectTaggingAccess,
  type SimS3ObjectTaggingAccessProperties,
} from "../tagging/sim-s3-object-tagging-access.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimGetObjectTaggingCommand,
  SimGetObjectTaggingCommandOutput,
} from "./get-object-tagging.command.js";

/**
 * Simulated S3 GetObjectTaggingCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectTaggingCommand/
 */
export class GetObjectTaggingCommandHandler implements CommandHandler<
  SimGetObjectTaggingCommand,
  SimGetObjectTaggingCommandOutput
> {
  private readonly access: SimS3ObjectTaggingAccess;

  constructor(properties: SimS3ObjectTaggingAccessProperties) {
    this.access = new SimS3ObjectTaggingAccess(properties);
  }

  /**
   * Read the tags on an Object, or on the version the request named.
   *
   * An Object nobody has tagged answers with an empty set rather than a
   * refusal, as real S3 does. Nothing is announced: real S3 raises a tagging
   * event for a change to the tags, and a read changes nothing.
   */
  async handle(
    command: SimGetObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetObjectTaggingCommandOutput> {
    const { taggable } = await this.access.reach(
      {
        commandName: "GetObjectTaggingCommand",
        action: "s3:GetObjectTagging",
        input: command.input,
      },
      options,
    );

    return {
      TagSet: taggable.tagSet.tags,
      ...(taggable.versionId !== undefined && {
        VersionId: taggable.versionId,
      }),
      $metadata: {},
    };
  }
}
