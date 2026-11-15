import {
  type SimAwsTagInput,
  simAwsTagPairs,
} from "../../../aws/tag/sim-aws-resource-tags.js";
import { simIamRequestTagRecordConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimKmsTag } from "../../key/sim-kms-key-tags.js";
import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";

/**
 * The tags a request sets, and its options carrying them to IAM.
 */
export interface SimKmsRequestTags {
  readonly tags: SimAwsTagInput;

  /**
   * Whether the request sets any tag at all. Creating a key with tags needs
   * `kms:TagResource` as well, and an empty list sets none.
   */
  readonly tagged: boolean;

  /**
   * The request's options with the tags as `aws:RequestTag/<key>` and
   * `aws:TagKeys`.
   */
  readonly options: SimKmsRequestOptions;
}

/**
 * Read the tags a KMS request sets.
 */
export function simKmsRequestTags(
  input: readonly SimKmsTag[] | undefined,
  options: SimKmsRequestOptions | undefined,
): SimKmsRequestTags {
  const tags = simAwsTagPairs(
    (input ?? []).map((tag) => [tag.TagKey, tag.TagValue]),
  );

  return {
    tags,
    tagged: tags.length > 0,
    options: {
      ...options,
      requestConditions: simIamRequestTagRecordConditions(
        Object.fromEntries(tags),
      ),
    },
  };
}
