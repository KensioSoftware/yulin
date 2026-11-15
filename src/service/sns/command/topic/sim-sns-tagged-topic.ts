import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  SimSnsInvalidParameterException,
  SimSnsResourceNotFoundException,
} from "../../error/sim-sns.error.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";

/**
 * The topic a tag command names, once the caller is allowed the action on it.
 *
 * The tag commands answer an ARN naming no topic with `ResourceNotFound`,
 * where the other topic commands answer `NotFound`.
 */
export function simSnsTaggedTopic(
  access: SimSnsTopicAccess,
  action: string,
  resourceArn: string | undefined,
  options: SimSnsRequestOptions | undefined,
  requestConditions?: SimIamConditions,
): SimSnsTopic {
  const topic = access.findByArn(action, resourceArn, {
    ...options,
    requestConditions,
  });

  if (topic === undefined) {
    throw new SimSnsResourceNotFoundException(
      `Can't perform the action on the specified resource: no topic ${String(
        resourceArn,
      )}`,
    );
  }

  return topic;
}

/**
 * A request parameter an operation cannot go without, refusing a request
 * that leaves it out as `InvalidParameter`.
 */
export function simSnsRequired<Value>(
  value: Value | undefined,
  operation: string,
  parameter: string,
): Value {
  if (value === undefined) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: ${operation} requires ${parameter}`,
    );
  }

  return value;
}
