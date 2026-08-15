import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { makeSimRoleArn } from "../../../iam/role/arn/sim-iam-role-arn.js";
import type { SimIamRoleName } from "../../../iam/role/sim-iam-role.js";

/**
 * The Role a task definition property names, resolved to an ARN.
 *
 * A template names a Role either as an ARN or as a `Ref` to an
 * `AWS::IAM::Role` of the same stack, and a `Ref` to a Role resolves to the
 * Role name rather than its ARN. A plain name is therefore mapped to the ARN it
 * would have at the default path, which is what `Fn::GetAtt Role.Arn` would
 * have resolved to.
 *
 * This is the same resolution an `AWS::Lambda::Function` `Role` goes through,
 * and for the same reason: a task definition holding a Role name rather than a
 * Role ARN would attribute a container's AWS calls to nobody.
 */
export function simCfnEcsRoleArn(
  resource: SimCfnResource,
  role: string | undefined,
): string | undefined {
  if (role === undefined) {
    return undefined;
  }

  if (role.startsWith("arn:")) {
    return role;
  }

  return makeSimRoleArn({
    accountId: resource.accountRegionScope.accountId,
    path: "/",
    roleName: role as SimIamRoleName,
  });
}
