import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { wafWebAclResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * The web ACL Resource an association names that the deployment skipped, or
 * nothing when the web ACL is there.
 *
 * A skipped Resource reaches CREATE_COMPLETE, so everything naming one goes on
 * to create, and `Fn::GetAtt` on it answers with a stand-in rather than an
 * ARN. An association handing that stand-in to AssociateWebACL would fail the
 * stack on a web ACL that does not exist, which is the failure skipping the
 * web ACL was there to avoid. So the association is skipped alongside it,
 * having lost what it pointed at.
 *
 * The web ACL is looked for among the Resources the association depends on,
 * which is where a template names one: `WebACLArn` is an `Fn::GetAtt` on the
 * web ACL beside it. An association naming a literal ARN depends on nothing
 * and is left to AssociateWebACL, which has no way to tell a skipped web ACL
 * from a mistyped ARN.
 */
export function skippedSimCfnWafWebAcl(
  resource: SimCfnResource,
  resources: ReadonlyMap<string, SimCfnResource>,
): SimCfnResource | undefined {
  return resource
    .dependencies()
    .map((logicalId) => resources.get(logicalId))
    .find(
      (dependency) =>
        dependency?.type === wafWebAclResourceType && dependency.skipped,
    );
}
