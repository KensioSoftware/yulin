import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { simIamRequestTagConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type { SimEcsAuthorizer } from "./sim-ecs-authorizer.js";

/**
 * One tag an ECS create request carries.
 */
interface SimEcsCreateTag {
  readonly key?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * Ensure the caller may create a resource with the tags its request carries.
 *
 * The create action takes no resource, and sees the tags as
 * `aws:RequestTag/<key>` and `aws:TagKeys`. A request carrying at least one
 * tag needs `ecs:TagResource` as well, on the ARN the resource is about to
 * have, with the create action's name as `ecs:CreateAction`. That is how
 * ECS's own tagging authorization example scopes tagging to creation.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/supported-iam-actions-tagging.html
 */
export function simEcsAuthorizeTaggedCreate(
  authorizer: SimEcsAuthorizer,
  operation: string,
  createdArn: string,
  tags: readonly SimEcsCreateTag[] | undefined,
  options?: SimEcsRequestOptions,
): SimAwsResolvedCaller {
  const conditions = simIamRequestTagConditions(
    tags?.map((tag) => ({ Key: tag.key, Value: tag.value })),
  );
  const caller = authorizer.authorizeResource(
    `ecs:${operation}`,
    "*",
    options,
    conditions,
  );

  if (tags !== undefined && tags.length > 0) {
    authorizer.authorizeResource("ecs:TagResource", createdArn, options, {
      ...conditions,
      "ecs:CreateAction": operation,
    });
  }

  return caller;
}
