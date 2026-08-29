import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The longest name Lambda accepts for a function.
 *
 * The 140 characters `CreateFunction` documents are for a full ARN. A bare
 * function name, which is what a template generates, gets 64.
 *
 * https://docs.aws.amazon.com/lambda/latest/api/API_CreateFunction.html
 */
const maximumNameLength = 64;

/**
 * The name CloudFormation gives a function whose template does not name it.
 *
 * Sixty-four characters is short for a name made of a stack name and a logical
 * ID, so the trimming `SimCfnGeneratedResourceName` does is the usual case here
 * rather than the exception. The case is left alone, since Lambda keeps a name
 * as it was given, and every character a stack name or a logical ID is made of
 * is one a function name allows.
 */
export function simCfnLambdaGeneratedFunctionName(
  resource: SimCfnResource,
): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength: maximumNameLength,
  }).value;
}
