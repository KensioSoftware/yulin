import { simIamRequestTagRecordConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsQueueAccess } from "./sim-sqs-queue-access.js";

/**
 * Ensure the caller may create a queue, and tag it where the request carries
 * at least one tag, which takes `sqs:TagQueue` as well.
 *
 * Both actions see the tags as `aws:RequestTag/<key>` and their keys as
 * `aws:TagKeys`, as the Service Authorization Reference lists for them.
 */
export function simSqsAuthorizeCreateQueue(
  access: SimSqsQueueAccess,
  name: string,
  tags: Readonly<Record<string, string>> | undefined,
  options: SimSqsRequestOptions | undefined,
): void {
  const tagged = {
    ...options,
    requestConditions: simIamRequestTagRecordConditions(tags),
  };

  access.authorizeName("sqs:CreateQueue", name, tagged);

  if (tags !== undefined && Object.keys(tags).length > 0) {
    access.authorizeName("sqs:TagQueue", name, tagged);
  }
}
