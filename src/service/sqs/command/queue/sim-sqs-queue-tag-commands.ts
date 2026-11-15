import {
  simIamRequestTagRecordConditions,
  simIamTagKeyConditions,
} from "../../../iam/tag/sim-iam-tag-conditions.js";
import { SimSqsMissingParameter } from "../../error/sim-sqs.error.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsQueueAccess } from "./sim-sqs-queue-access.js";
import type {
  SimListQueueTagsCommand,
  SimListQueueTagsCommandOutput,
  SimTagQueueCommand,
  SimTagQueueCommandOutput,
  SimUntagQueueCommand,
  SimUntagQueueCommandOutput,
} from "./tag.command.js";

/**
 * The commands that tag, untag and list the tags of a queue.
 *
 * `TagQueue` gives IAM the tags it sets as `aws:RequestTag/<key>` and their
 * keys as `aws:TagKeys`, and `UntagQueue` gives the keys it removes as
 * `aws:TagKeys`, as the Service Authorization Reference lists for them.
 */
export class SimSqsQueueTagCommands {
  readonly #access: SimSqsQueueAccess;

  constructor(access: SimSqsQueueAccess) {
    this.#access = access;
  }

  /**
   * Add tags to a queue, replacing the value of any key already there.
   */
  tagQueue(
    command: SimTagQueueCommand,
    options?: SimSqsRequestOptions,
  ): SimTagQueueCommandOutput {
    const { QueueUrl, Tags } = command.input;

    if (Tags === undefined) {
      throw new SimSqsMissingParameter("TagQueue requires Tags");
    }

    this.#access
      .requireByUrl("sqs:TagQueue", QueueUrl, {
        ...options,
        requestConditions: simIamRequestTagRecordConditions(Tags),
      })
      .tags.apply(Tags);

    return { $metadata: {} };
  }

  /**
   * Take tags off a queue.
   */
  untagQueue(
    command: SimUntagQueueCommand,
    options?: SimSqsRequestOptions,
  ): SimUntagQueueCommandOutput {
    const { QueueUrl, TagKeys } = command.input;

    if (TagKeys === undefined) {
      throw new SimSqsMissingParameter("UntagQueue requires TagKeys");
    }

    this.#access
      .requireByUrl("sqs:UntagQueue", QueueUrl, {
        ...options,
        requestConditions: simIamTagKeyConditions(TagKeys),
      })
      .tags.remove(TagKeys);

    return { $metadata: {} };
  }

  /**
   * List the tags a queue holds. A queue holding none answers without `Tags`.
   */
  listQueueTags(
    command: SimListQueueTagsCommand,
    options?: SimSqsRequestOptions,
  ): SimListQueueTagsCommandOutput {
    const tags = this.#access
      .requireByUrl("sqs:ListQueueTags", command.input.QueueUrl, options)
      .tags.record();

    return {
      $metadata: {},
      ...(Object.keys(tags).length > 0 && { Tags: { ...tags } }),
    };
  }
}
