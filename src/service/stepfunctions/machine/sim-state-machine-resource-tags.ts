import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimStateMachineStore } from "./sim-state-machine-store.js";

/**
 * IAM authorization that gives a policy the tags of the state machine a
 * request acts on, as `aws:ResourceTag/<key>`.
 *
 * An execution holds no tags, and a request naming one carries none.
 */
export function simStatesTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  stateMachines: SimStateMachineStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) =>
    stateMachines.find(resource)?.tags.record(),
  );
}
