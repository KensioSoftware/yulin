import type { AwsRegionName } from "../../../aws/sim-aws-region.js";

interface SimRestApiStageArnProperties {
  readonly regionName: AwsRegionName;
  readonly restApiId: string;
  readonly stageName: string;
}

/**
 * The ARN naming one stage of a REST API.
 *
 * API Gateway writes it with an empty Account and the control plane path of
 * the stage, so it looks unlike the `execute-api` ARNs a request is authorized
 * against. This is the form WAFv2 associates a web ACL with.
 */
export function simRestApiStageArn(
  properties: SimRestApiStageArnProperties,
): string {
  const { regionName, restApiId, stageName } = properties;

  return `arn:aws:apigateway:${regionName}::/restapis/${restApiId}/stages/${stageName}`;
}
