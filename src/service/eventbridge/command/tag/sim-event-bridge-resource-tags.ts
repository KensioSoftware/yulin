import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamResourceTagAuthZ } from "../../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import { simEventBridgeTagsOf } from "./sim-event-bridge-tagged-resource.js";

/**
 * IAM authorization that gives a policy the tags of the rule or event bus a
 * request acts on, as `aws:ResourceTag/<key>`.
 *
 * A rule or bus the request is about to create carries none.
 */
export function simEventBridgeTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  buses: SimEventBusStore,
  rules: SimEventRuleStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) =>
    simEventBridgeTagsOf(buses, rules, resource)?.record(),
  );
}
