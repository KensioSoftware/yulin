import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN a request authorizes against for the model it names.
 *
 * A `modelId` reaches Bedrock in several forms. A base model id such as
 * `anthropic.claude-3-5-sonnet-20241022-v2:0` names a foundation model, which
 * belongs to no account and carries an empty account field in its ARN. An
 * inference profile, a provisioned model and a prompt version all arrive as
 * ARNs already, and are authorized against as they were written.
 */
export function simBedrockModelArn(
  accountRegionScope: SimAwsAccountRegionScope,
  modelId: string,
): string {
  if (modelId.startsWith("arn:")) {
    return modelId;
  }

  return `arn:aws:bedrock:${accountRegionScope.regionName}::foundation-model/${modelId}`;
}
