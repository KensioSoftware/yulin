import { simIamTagKeyConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";
import { simKmsRequestTags } from "./sim-kms-request-tags.js";
import { type SimKmsTagScope, simKmsTaggedKey } from "./sim-kms-tagged-key.js";
import type {
  SimKmsTagResourceCommand,
  SimKmsTagResourceCommandOutput,
  SimKmsUntagResourceCommand,
  SimKmsUntagResourceCommandOutput,
  SimListResourceTagsCommand,
  SimListResourceTagsCommandOutput,
} from "./tag.command.js";

/**
 * The commands that tag a key, take tags off it and list them.
 *
 * A request names the key by its ID or ARN. An alias is refused, since the
 * tag commands take neither form of it. A key pending deletion keeps its tags
 * and can still list them, and tagging or untagging it is refused. An AWS
 * managed key's policy grants no tagging, so tagging one is refused as access
 * denied.
 */
export class SimKmsTagCommands {
  private readonly scope: SimKmsTagScope;

  constructor(scope: SimKmsTagScope) {
    this.scope = scope;
  }

  /**
   * Add tags to a key, replacing the value of any key it holds.
   */
  tagResource(
    command: SimKmsTagResourceCommand,
    options?: SimKmsRequestOptions,
  ): SimKmsTagResourceCommandOutput {
    const request = simKmsRequestTags(command.input.Tags, options);

    simKmsTaggedKey(
      this.scope,
      "kms:TagResource",
      command.input.KeyId,
      request.options,
      true,
    ).tags.apply(request.tags);

    return { $metadata: {} };
  }

  /**
   * Take the keys a request names off a key.
   */
  untagResource(
    command: SimKmsUntagResourceCommand,
    options?: SimKmsRequestOptions,
  ): SimKmsUntagResourceCommandOutput {
    const keys = command.input.TagKeys ?? [];

    simKmsTaggedKey(
      this.scope,
      "kms:UntagResource",
      command.input.KeyId,
      { ...options, requestConditions: simIamTagKeyConditions(keys) },
      true,
    ).tags.remove(keys);

    return { $metadata: {} };
  }

  /**
   * The tags a key holds, all on one page.
   */
  listResourceTags(
    command: SimListResourceTagsCommand,
    options?: SimKmsRequestOptions,
  ): SimListResourceTagsCommandOutput {
    const key = simKmsTaggedKey(
      this.scope,
      "kms:ListResourceTags",
      command.input.KeyId,
      options,
      false,
    );

    return {
      $metadata: {},
      Tags: key.tags
        .list()
        .map(({ Key, Value }) => ({ TagKey: Key, TagValue: Value })),
      Truncated: false,
    };
  }
}
