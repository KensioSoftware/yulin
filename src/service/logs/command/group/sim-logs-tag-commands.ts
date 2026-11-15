import {
  simIamRequestTagRecordConditions,
  simIamTagKeyConditions,
} from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import {
  type SimLogsTagScope,
  simLogsTaggedGroup,
} from "./sim-logs-tagged-group.js";
import type {
  SimLogsListTagsForResourceCommand,
  SimLogsListTagsForResourceCommandOutput,
  SimLogsTagResourceCommand,
  SimLogsTagResourceCommandOutput,
  SimLogsUntagResourceCommand,
  SimLogsUntagResourceCommandOutput,
} from "./tag.command.js";

/**
 * The commands that tag a log group, take tags off it and list them.
 *
 * A request names the group by its ARN, with or without the trailing `:*`.
 * Log groups are the only CloudWatch Logs resources whose tags are
 * simulated, so an ARN naming anything else is refused.
 */
export class SimLogsTagCommands {
  readonly #scope: SimLogsTagScope;

  constructor(scope: SimLogsTagScope) {
    this.#scope = scope;
  }

  /**
   * Add tags to a log group, replacing the value of any key it holds.
   */
  tagResource(
    command: SimLogsTagResourceCommand,
    options?: SimLogsRequestOptions,
  ): SimLogsTagResourceCommandOutput {
    const tags = command.input.tags ?? {};

    simLogsTaggedGroup(
      this.#scope,
      "logs:TagResource",
      command.input.resourceArn,
      options,
      simIamRequestTagRecordConditions(tags),
    ).tags.apply(tags);

    return { $metadata: {} };
  }

  /**
   * Take the keys a request names off a log group.
   */
  untagResource(
    command: SimLogsUntagResourceCommand,
    options?: SimLogsRequestOptions,
  ): SimLogsUntagResourceCommandOutput {
    const keys = command.input.tagKeys ?? [];

    simLogsTaggedGroup(
      this.#scope,
      "logs:UntagResource",
      command.input.resourceArn,
      options,
      simIamTagKeyConditions(keys),
    ).tags.remove(keys);

    return { $metadata: {} };
  }

  /**
   * The tags a log group holds.
   */
  listTagsForResource(
    command: SimLogsListTagsForResourceCommand,
    options?: SimLogsRequestOptions,
  ): SimLogsListTagsForResourceCommandOutput {
    const group = simLogsTaggedGroup(
      this.#scope,
      "logs:ListTagsForResource",
      command.input.resourceArn,
      options,
      {},
    );

    return { $metadata: {}, tags: group.tags.record() };
  }
}
