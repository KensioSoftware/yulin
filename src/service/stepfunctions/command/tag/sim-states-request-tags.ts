import {
  simIamRequestTagConditions,
  simIamTagKeyConditions,
} from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  type SimIamTagOnCreate,
  simIamTagOnCreate,
} from "../../../iam/tag/sim-iam-tag-on-create.js";
import type { SimStatesTagInput } from "../../machine/sim-state-machine-tag.js";
import { simStatesAuthorizeRequest } from "../authorize/sim-step-functions-authorize-request.js";
import type { SimStepFunctionsAuthorizer } from "../authorize/sim-step-functions-authorizer.js";
import type { SimStepFunctionsRequestOptions } from "../sim-step-functions-request-options.js";
import type {
  SimTagResourceCommandInput,
  SimUntagResourceCommandInput,
} from "./tag.command.js";

/**
 * Step Functions tags in the `Key` and `Value` shape IAM reads.
 */
function asIamTags(
  tags: readonly SimStatesTagInput[] | undefined,
): { Key: string | undefined; Value: string | undefined }[] | undefined {
  return tags?.map((tag) => ({ Key: tag.key, Value: tag.value }));
}

/**
 * Ensure the caller may tag the resource a TagResource request names, with
 * the tags it sets as `aws:RequestTag/<key>` and `aws:TagKeys`.
 */
export function simStatesAuthorizeTagResource(
  authorizer: SimStepFunctionsAuthorizer,
  input: SimTagResourceCommandInput,
  options: SimStepFunctionsRequestOptions | undefined,
): void {
  simStatesAuthorizeRequest(
    authorizer,
    "states:TagResource",
    input.resourceArn,
    options,
    simIamRequestTagConditions(asIamTags(input.tags)),
  );
}

/**
 * Ensure the caller may untag the resource an UntagResource request names,
 * with the keys it removes as `aws:TagKeys`.
 */
export function simStatesAuthorizeUntagResource(
  authorizer: SimStepFunctionsAuthorizer,
  input: SimUntagResourceCommandInput,
  options: SimStepFunctionsRequestOptions | undefined,
): void {
  simStatesAuthorizeRequest(
    authorizer,
    "states:UntagResource",
    input.resourceArn,
    options,
    simIamTagKeyConditions(input.tagKeys),
  );
}

/**
 * The actions and conditions for a CreateStateMachine request, which needs
 * `states:TagResource` as well when it carries tags.
 */
export function simStatesTagOnCreate(
  tags: readonly SimStatesTagInput[] | undefined,
): SimIamTagOnCreate {
  return simIamTagOnCreate(
    "states:CreateStateMachine",
    "states:TagResource",
    asIamTags(tags),
  );
}
