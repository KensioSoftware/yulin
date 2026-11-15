import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simAwsTagPairs } from "../../../aws/tag/sim-aws-resource-tags.js";
import {
  simIamRequestTagRecordConditions,
  simIamTagKeyConditions,
} from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  type SimSsmTagScope,
  simSsmTaggedParameter,
} from "./sim-ssm-tagged-parameter.js";
import type {
  SimAddTagsToResourceCommand,
  SimAddTagsToResourceCommandOutput,
  SimRemoveTagsFromResourceCommand,
  SimRemoveTagsFromResourceCommandOutput,
  SimSsmListTagsForResourceCommand,
  SimSsmListTagsForResourceCommandOutput,
} from "./tag.command.js";

interface SimSsmTagCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that tag a parameter, take tags off it and list them.
 *
 * A request names a parameter by its type, `Parameter`, and its name with or
 * without the leading slash.
 */
export class SimSsmTagCommands {
  private readonly scope: SimSsmTagScope;

  constructor(scope: SimSsmTagScope) {
    this.scope = scope;
  }

  /**
   * Add tags to a parameter, replacing the value of any key it holds.
   */
  add(
    command: SimAddTagsToResourceCommand,
    options?: SimSsmTagCommandsOptions,
  ): SimAddTagsToResourceCommandOutput {
    const tags = simAwsTagPairs(
      (command.input.Tags ?? []).map((tag) => [tag.Key, tag.Value]),
    );

    simSsmTaggedParameter(
      this.scope,
      "ssm:AddTagsToResource",
      command.input,
      options?.caller,
      simIamRequestTagRecordConditions(tags),
    ).tags.apply(tags);

    return { $metadata: {} };
  }

  /**
   * Take the keys a request names off a parameter.
   */
  remove(
    command: SimRemoveTagsFromResourceCommand,
    options?: SimSsmTagCommandsOptions,
  ): SimRemoveTagsFromResourceCommandOutput {
    const keys = command.input.TagKeys ?? [];

    simSsmTaggedParameter(
      this.scope,
      "ssm:RemoveTagsFromResource",
      command.input,
      options?.caller,
      simIamTagKeyConditions(keys),
    ).tags.remove(keys);

    return { $metadata: {} };
  }

  /**
   * The tags a parameter holds.
   */
  list(
    command: SimSsmListTagsForResourceCommand,
    options?: SimSsmTagCommandsOptions,
  ): SimSsmListTagsForResourceCommandOutput {
    const parameter = simSsmTaggedParameter(
      this.scope,
      "ssm:ListTagsForResource",
      command.input,
      options?.caller,
      {},
    );

    return { $metadata: {}, TagList: parameter.tags.list() };
  }
}
