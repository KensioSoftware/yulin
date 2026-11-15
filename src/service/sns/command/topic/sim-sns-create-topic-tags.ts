import { simIamRequestTagConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import type {
  SimSnsTagInput,
  SimSnsTopicTags,
} from "../../topic/sim-sns-topic-tags.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";

/**
 * Ensure the caller may create a topic, and tag it where the request carries
 * at least one tag, which takes `sns:TagResource` as well.
 *
 * Both actions see the tags as `aws:RequestTag/<key>` and their keys as
 * `aws:TagKeys`, as the Service Authorization Reference lists for them.
 */
export function simSnsAuthorizeCreateTopic(
  access: SimSnsTopicAccess,
  name: string,
  tags: readonly SimSnsTagInput[] | undefined,
  options: SimSnsRequestOptions | undefined,
): void {
  const tagged = {
    ...options,
    requestConditions: simIamRequestTagConditions(tags),
  };

  access.authorizeName("sns:CreateTopic", name, tagged);

  if (tags !== undefined && tags.length > 0) {
    access.authorizeName("sns:TagResource", name, tagged);
  }
}

/**
 * Refuse a repeated CreateTopic carrying tags the existing topic does not
 * hold. A repeated request carrying no tags answers with the topic as it is.
 */
export function assertSimSnsSameTopicTags(
  existing: SimSnsTopic,
  input: readonly SimSnsTagInput[] | undefined,
  requested: SimSnsTopicTags,
): void {
  if (input !== undefined && !existing.tags.equals(requested)) {
    throw new SimSnsInvalidParameterException(
      "Invalid parameter: Tags Reason: Topic already exists with different tags",
    );
  }
}
