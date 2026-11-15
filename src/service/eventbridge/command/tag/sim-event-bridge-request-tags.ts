import { simAwsTagPairs } from "../../../aws/tag/sim-aws-resource-tags.js";
import { simIamRequestTagRecordConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimEventBridgeTag } from "../bus/bus.command.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";

/**
 * The tags a request sets, and its options carrying them to IAM.
 */
export interface SimEventBridgeRequestTags {
  readonly tags: Readonly<Record<string, string>>;

  /**
   * The actions the request is authorized for. Creating a rule or bus with
   * tags needs `events:TagResource` as well as its own action, and an empty
   * list sets no tags.
   */
  readonly actions: readonly string[];

  /**
   * The request's options with the tags as `aws:RequestTag/<key>` and
   * `aws:TagKeys`.
   */
  readonly options: SimEventBridgeRequestOptions;
}

/**
 * Read the tags an EventBridge request sets, and the actions it needs.
 *
 * A request that would create nothing, such as a `PutRule` replacing an
 * existing rule, sets no tags and needs its own action alone.
 */
export function simEventBridgeRequestTags(
  input: readonly SimEventBridgeTag[] | undefined,
  options: SimEventBridgeRequestOptions | undefined,
  action: string,
  creating = true,
): SimEventBridgeRequestTags {
  const tags = simAwsTagPairs((input ?? []).map((tag) => [tag.Key, tag.Value]));

  return {
    tags,
    actions:
      creating && Object.keys(tags).length > 0
        ? [action, "events:TagResource"]
        : [action],
    options: {
      ...options,
      requestConditions: simIamRequestTagRecordConditions(tags),
    },
  };
}
