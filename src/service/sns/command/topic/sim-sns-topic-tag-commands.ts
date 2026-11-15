import {
  simIamRequestTagConditions,
  simIamTagKeyConditions,
} from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";
import { simSnsRequired, simSnsTaggedTopic } from "./sim-sns-tagged-topic.js";
import type {
  SimListTagsForResourceCommand,
  SimListTagsForResourceCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./topic.command.js";

/**
 * The commands that tag, untag and list the tags of a topic.
 *
 * `TagResource` gives IAM the tags it sets as `aws:RequestTag/<key>` and their
 * keys as `aws:TagKeys`, and `UntagResource` gives the keys it removes as
 * `aws:TagKeys`. An ARN naming no topic is `ResourceNotFound`.
 */
export class SimSnsTopicTagCommands {
  readonly #access: SimSnsTopicAccess;

  constructor(access: SimSnsTopicAccess) {
    this.#access = access;
  }

  /**
   * Add tags to a topic, replacing the value of any key already there.
   */
  tagResource(
    command: SimTagResourceCommand,
    options?: SimSnsRequestOptions,
  ): SimTagResourceCommandOutput {
    const { ResourceArn } = command.input;
    const Tags = simSnsRequired(command.input.Tags, "TagResource", "Tags");

    simSnsTaggedTopic(
      this.#access,
      "sns:TagResource",
      ResourceArn,
      options,
      simIamRequestTagConditions(Tags),
    ).tags.apply(Tags);

    return { $metadata: {} };
  }

  /**
   * Take tags off a topic.
   */
  untagResource(
    command: SimUntagResourceCommand,
    options?: SimSnsRequestOptions,
  ): SimUntagResourceCommandOutput {
    const { ResourceArn } = command.input;
    const TagKeys = simSnsRequired(
      command.input.TagKeys,
      "UntagResource",
      "TagKeys",
    );

    simSnsTaggedTopic(
      this.#access,
      "sns:UntagResource",
      ResourceArn,
      options,
      simIamTagKeyConditions(TagKeys),
    ).tags.remove(TagKeys);

    return { $metadata: {} };
  }

  /**
   * List the tags a topic holds.
   */
  listTagsForResource(
    command: SimListTagsForResourceCommand,
    options?: SimSnsRequestOptions,
  ): SimListTagsForResourceCommandOutput {
    const topic = simSnsTaggedTopic(
      this.#access,
      "sns:ListTagsForResource",
      command.input.ResourceArn,
      options,
    );

    return { $metadata: {}, Tags: topic.tags.list() };
  }
}
