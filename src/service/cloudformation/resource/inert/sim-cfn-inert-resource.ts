import { SimCdkProviderScaffolding } from "../../cdk/provider/sim-cdk-provider-scaffolding.js";
import type { SimCfnResource } from "../sim-cfn-resource.js";
import { simCfnInertResourceTypes } from "./sim-cfn-inert-resource-types.js";

/**
 * Why nothing this simulator models could tell this Resource apart from one it
 * created, or undefined when something could.
 *
 * Asked only of a Resource no factory would create, so this decides how that is
 * reported rather than whether the Resource is created. A Resource type a
 * service does create is created, whatever this would have said about it: a
 * template function bound to a real in-process handler is deployed and
 * invocable even when it is CDK's own provider.
 *
 * Two things can make a Resource inert. Its type can be one no simulated
 * service reads, whatever Stack it turns up in, which is
 * {@link simCfnInertResourceTypes}. Or the Stack around it can make it inert:
 * CDK's provider function for a custom Resource this simulator carries out
 * itself has nothing left to do, which is {@link SimCdkProviderScaffolding}.
 */
export function simCfnInertResourceReason(
  resource: SimCfnResource,
  resources: ReadonlyMap<string, SimCfnResource>,
): string | undefined {
  const { type } = resource;
  /* v8 ignore next 2 -- a Resource with no Type fails creation outright, before
   any factory is resolved that could refuse it and bring this question up */
  const typeReason =
    type === undefined ? undefined : simCfnInertResourceTypes.get(type);

  return (
    typeReason ?? new SimCdkProviderScaffolding(resources).reasonFor(resource)
  );
}
