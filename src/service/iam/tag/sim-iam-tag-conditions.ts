import type { SimIamConditionValue } from "../policy/sim-iam-policy.js";
import type {
  SimIamIdentityTags,
  SimIamTagsInput,
} from "./sim-iam-identity-tags.js";

/**
 * The condition values one request carries.
 */
export type SimIamConditions = Readonly<Record<string, SimIamConditionValue>>;

/**
 * What a request setting tags says about them to IAM.
 *
 * Each tag is `aws:RequestTag/` followed by its key, and the keys together
 * are `aws:TagKeys`. A request carrying no tags supplies neither.
 */
export function simIamRequestTagConditions(
  tags: SimIamTagsInput,
): SimIamConditions {
  if (tags === undefined || tags.length === 0) {
    return {};
  }

  return {
    ...Object.fromEntries(
      tags.map((tag) => [`aws:RequestTag/${tag.Key ?? ""}`, tag.Value ?? ""]),
    ),
    "aws:TagKeys": tags.map((tag) => tag.Key ?? ""),
  };
}

/**
 * What a request removing tags says about them to IAM, which is the keys it
 * removes as `aws:TagKeys`.
 */
export function simIamTagKeyConditions(
  keys: readonly string[] | undefined,
): SimIamConditions {
  return keys === undefined ? {} : { "aws:TagKeys": keys };
}

/**
 * What the tags of a Role or a User say about it when a request acts on it.
 *
 * IAM supplies each tag as both `iam:ResourceTag/` and `aws:ResourceTag/`
 * followed by its key. An entity that does not exist yet has no tags.
 */
export function simIamResourceTagConditions(
  tags: SimIamIdentityTags | undefined,
): SimIamConditions {
  if (tags === undefined) {
    return {};
  }

  return {
    ...tags.conditionValues("iam:ResourceTag/"),
    ...tags.conditionValues("aws:ResourceTag/"),
  };
}
