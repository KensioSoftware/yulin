import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  SimSsmInvalidResourceId,
  SimSsmInvalidResourceType,
} from "../../error/sim-ssm.error.js";
import type { SimSsmParameter } from "../../parameter/sim-ssm-parameter.js";
import { SimSsmParameterName } from "../../parameter/sim-ssm-parameter-name.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";

const parameterResourceType = "Parameter";

/**
 * Where a tag command finds its parameter and authorizes against it.
 */
export interface SimSsmTagScope {
  readonly parameters: SimSsmParameterStore;
  readonly authorizer: SimSsmAuthorizer;
}

/**
 * What a tag command names its resource by.
 */
export interface SimSsmTaggedResourceInput {
  readonly ResourceType?: string | undefined;
  readonly ResourceId?: string | undefined;
}

/**
 * The parameter a tag command names, once the caller is allowed the action
 * on it. The caller is authorized before the parameter is looked up. Only
 * parameters are simulated, so any other resource type is refused.
 */
export function simSsmTaggedParameter(
  scope: SimSsmTagScope,
  action: string,
  input: SimSsmTaggedResourceInput,
  caller: SimAwsCaller | undefined,
  conditions: SimIamConditions,
): SimSsmParameter {
  if (input.ResourceType !== parameterResourceType) {
    throw new SimSsmInvalidResourceType(
      `Resource type ${JSON.stringify(input.ResourceType ?? "")} is not ` +
        `simulated. Only ${parameterResourceType} is.`,
    );
  }

  const name = input.ResourceId ?? "";

  scope.authorizer.authorizeParameterResource(
    action,
    SimSsmParameterName.resourceFor(name),
    caller,
    conditions,
  );

  const parameter = scope.parameters.find(name);

  if (parameter === undefined) {
    throw new SimSsmInvalidResourceId(
      `The resource ID ${JSON.stringify(name)} isn't valid. Verify that ` +
        "you entered the correct ID and try again.",
    );
  }

  return parameter;
}
