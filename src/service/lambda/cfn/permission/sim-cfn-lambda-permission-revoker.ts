import type { SimLambdaPermission } from "../../function/policy/sim-lambda-permission.js";
import type { SimLambda } from "../../sim-lambda.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnLambdaCreatedResource } from "../sim-cfn-lambda-created-resource.js";
import { simCfnLambdaTargetFunction } from "../function/sim-cfn-lambda-target-function.js";

/**
 * Take an AWS::Lambda::Permission back off what it was granted on.
 *
 * The statement is named after the Resource's logical ID when it is added,
 * because AWS::Lambda::Permission has no StatementId property, so that is what
 * addresses it again here. A grant made on a version or an alias is revoked
 * from that same qualified resource, which the statement's own ARN names.
 */
export async function simCfnLambdaRevokePermission(
  lambda: SimLambda,
  resource: SimCfnResource,
): Promise<void> {
  const permission = simCfnLambdaCreatedResource<SimLambdaPermission>(
    resource,
    "permission",
  );
  const { functionName, qualifier } = simCfnLambdaTargetFunction(
    permission.resourceArn,
  );

  await lambda.removePermission({
    input: {
      FunctionName: functionName,
      Qualifier: qualifier,
      StatementId: permission.statementId,
    },
  });
}
