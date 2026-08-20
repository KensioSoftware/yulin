import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { wafWebAclResourceType } from "./sim-cfn-waf-resource-types.js";

/**
 * The skipped web ACL a resolved property names, or nothing when it names
 * none.
 *
 * A skipped Resource reaches CREATE_COMPLETE, so everything naming one goes on
 * to create, and `Ref` and `Fn::GetAtt` on it answer with a stand-in rather
 * than an ARN. A Resource that carried that stand-in to the service holding
 * the web ACL would fail the stack on a web ACL that does not exist, which is
 * the failure skipping the web ACL was there to avoid. So whatever named it is
 * skipped alongside it, having lost what it pointed at.
 *
 * The candidates are the web ACL Resources this one depends on, and the
 * property picks which of them it named. Matching the property matters,
 * because `dependencies()` covers `DependsOn` and every `Ref` and `Fn::GetAtt`
 * in the Resource. An association that waits on one web ACL and associates
 * another is made.
 *
 * The property is matched against what a skipped Resource answers with, which
 * is the logical ID for `Ref` and the logical ID and attribute name for
 * `Fn::GetAtt`. A property holding a literal ARN matches nothing here and is
 * left to the service, which has no way to tell a skipped web ACL from a
 * mistyped ARN.
 */
export function skippedSimCfnWafWebAclNamed(
  name: string,
  resource: SimCfnResource,
  resources: ReadonlyMap<string, SimCfnResource>,
): SimCfnResource | undefined {
  return skippedWebAcls(resource, resources).find(
    (webAcl) =>
      name === webAcl.logicalId || name.startsWith(`${webAcl.logicalId}.`),
  );
}

/**
 * The web ACL Resources a deployment skipped that this Resource depends on.
 */
function skippedWebAcls(
  resource: SimCfnResource,
  resources: ReadonlyMap<string, SimCfnResource>,
): readonly SimCfnResource[] {
  return resource
    .dependencies()
    .map((logicalId) => resources.get(logicalId))
    .filter(
      (dependency): dependency is SimCfnResource =>
        dependency?.type === wafWebAclResourceType && dependency.skipped,
    );
}
