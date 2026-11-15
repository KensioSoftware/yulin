import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimSsmParameterStore } from "./sim-ssm-parameter-store.js";

/**
 * IAM authorization that gives a policy the tags of the parameter a request
 * acts on, as both `aws:ResourceTag/<key>` and `ssm:ResourceTag/<key>`.
 *
 * A parameter the request is about to create carries none.
 */
export function simSsmTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  parameters: SimSsmParameterStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(
    iam,
    (resource) => {
      const name = /:parameter\/(.+)$/v.exec(resource)?.[1];
      const parameter = name === undefined ? undefined : parameters.find(name);

      return parameter?.arn.value === resource
        ? parameter.tags.record()
        : undefined;
    },
    "ssm",
  );
}
