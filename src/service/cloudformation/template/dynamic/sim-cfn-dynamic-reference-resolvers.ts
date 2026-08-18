import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnDynamicReferenceResolver } from "./sim-cfn-dynamic-reference.type.js";

/**
 * How one simulated service hands over its dynamic reference resolver, given
 * the Account and Region scope the Stack is deploying into.
 */
type SimCfnScopedDynamicReferenceResolver = (
  scopedAws: SimAwsAccountRegionContainer,
) => SimCfnDynamicReferenceResolver;

/**
 * The simulated service behind each `{{resolve:<service>:...}}` reference.
 *
 * The same shape as the Resource factory registry, for the same reason. A
 * service name with no entry here leaves its references in the template as
 * written, so a template using one this simulation has yet to implement still
 * deploys everything else.
 */
export const simCfnDynamicReferenceResolvers: ReadonlyMap<
  string,
  SimCfnScopedDynamicReferenceResolver
> = new Map([
  [
    "ssm",
    (scopedAws): SimCfnDynamicReferenceResolver =>
      scopedAws.ssm().cfnDynamicReferenceResolver(),
  ],
]);
