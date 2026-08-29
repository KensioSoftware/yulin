import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { maximumSimSsmParameterNameLength } from "../../parameter/sim-ssm-parameter-arn.js";

/**
 * The name CloudFormation gives a parameter whose template does not name it.
 *
 * How much room a name has is a question about the Account and Region rather
 * than about Parameter Store alone, since the ARN prefix comes out of the same
 * allowance. There is enough of it that a stack name and a logical ID rarely
 * reach the limit, so the trimming `SimCfnGeneratedResourceName` does is the
 * exception here rather than the usual case.
 *
 * The name carries no leading slash and so sits at the top of the hierarchy,
 * which is where real CloudFormation puts a parameter it names itself. The
 * case is left alone, since Parameter Store keeps a name as it was given, and
 * every character a stack name or a logical ID is made of is one a parameter
 * name allows.
 */
export function simCfnSsmGeneratedParameterName(
  resource: SimCfnResource,
): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength: maximumSimSsmParameterNameLength(
      resource.accountRegionScope,
    ),
  }).value;
}
