import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionContainer } from "../../../aws/sim-aws-account-region-scope.js";
import { SimCfnSecretsManagerDynamicReferenceResolver } from "../../../secretsmanager/cfn/dynamic/sim-cfn-secrets-manager-dynamic-reference-resolver.js";
import type { SimCfnDynamicReferenceResolver } from "./sim-cfn-dynamic-reference.type.js";

/**
 * The simulation a dynamic reference resolver is built against.
 *
 * A reference reads the Stack's own Account and Region, which is what
 * `scopedAws` is. The whole simulation comes with it because a reference can
 * name another Account. A `secretsmanager` reference carrying a secret ARN
 * reads the Account that ARN names, as real CloudFormation does.
 */
interface SimCfnDynamicReferenceSimulation {
  readonly simAws: SimAws;
  readonly scopedAws: SimAwsAccountRegionContainer;
}

/**
 * How one simulated service hands over its dynamic reference resolver, given
 * the simulation the Stack is deploying into.
 */
type SimCfnScopedDynamicReferenceResolver = (
  simulation: SimCfnDynamicReferenceSimulation,
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
    ({ scopedAws }): SimCfnDynamicReferenceResolver =>
      scopedAws.ssm().cfnDynamicReferenceResolver(),
  ],
  [
    "ssm-secure",
    ({ scopedAws }): SimCfnDynamicReferenceResolver =>
      scopedAws.ssm().cfnSecureDynamicReferenceResolver(),
  ],
  [
    "secretsmanager",
    ({ simAws, scopedAws }): SimCfnDynamicReferenceResolver =>
      new SimCfnSecretsManagerDynamicReferenceResolver({
        secretsManager: scopedAws.secretsManager(),
        secretsManagerIn: (scope) =>
          simAws
            .accountRegionScope(scope.accountId, scope.regionName)
            .secretsManager(),
      }),
  ],
]);
