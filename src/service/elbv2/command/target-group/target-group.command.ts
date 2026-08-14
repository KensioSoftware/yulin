import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2HealthCheckInput } from "../../target-group/sim-elbv2-health-check.js";
import type { SimElbV2TargetGroupView } from "../../target-group/sim-elbv2-target-group.js";
import type { SimElbV2Tag } from "../sim-elbv2-shared.command.js";

/**
 * Minimal structural sim ELBv2 CreateTargetGroup command.
 */
export interface SimCreateTargetGroupCommand {
  readonly input: SimCreateTargetGroupCommandInput;
}

/**
 * Minimal structural sim ELBv2 CreateTargetGroup input.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html
 */
export type SimCreateTargetGroupCommandInput = SimElbV2HealthCheckInput & {
  readonly Name?: string | undefined;
  readonly TargetType?: string | undefined;
  readonly Protocol?: string | undefined;
  readonly ProtocolVersion?: string | undefined;
  readonly Port?: number | undefined;
  readonly VpcId?: string | undefined;
  readonly IpAddressType?: string | undefined;
  readonly Tags?: readonly SimElbV2Tag[] | undefined;
};

/**
 * Minimal structural sim ELBv2 CreateTargetGroup output.
 */
export interface SimCreateTargetGroupCommandOutput {
  readonly TargetGroups?: readonly SimElbV2TargetGroupView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetGroups command.
 */
export interface SimDescribeTargetGroupsCommand {
  readonly input: SimDescribeTargetGroupsCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetGroups input.
 */
export interface SimDescribeTargetGroupsCommandInput {
  readonly LoadBalancerArn?: string | undefined;
  readonly TargetGroupArns?: readonly string[] | undefined;
  readonly Names?: readonly string[] | undefined;
  readonly Marker?: string | undefined;
  readonly PageSize?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetGroups output.
 */
export interface SimDescribeTargetGroupsCommandOutput {
  readonly TargetGroups?: readonly SimElbV2TargetGroupView[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 ModifyTargetGroup command.
 */
export interface SimModifyTargetGroupCommand {
  readonly input: SimModifyTargetGroupCommandInput;
}

/**
 * Minimal structural sim ELBv2 ModifyTargetGroup input.
 *
 * Real ELB only lets health check settings be changed on an existing target
 * group, so those are the whole of this input.
 */
export type SimModifyTargetGroupCommandInput = SimElbV2HealthCheckInput & {
  readonly TargetGroupArn?: string | undefined;
};

/**
 * Minimal structural sim ELBv2 ModifyTargetGroup output.
 */
export interface SimModifyTargetGroupCommandOutput {
  readonly TargetGroups?: readonly SimElbV2TargetGroupView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DeleteTargetGroup command.
 */
export interface SimDeleteTargetGroupCommand {
  readonly input: SimDeleteTargetGroupCommandInput;
}

/**
 * Minimal structural sim ELBv2 DeleteTargetGroup input.
 */
export interface SimDeleteTargetGroupCommandInput {
  readonly TargetGroupArn?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 DeleteTargetGroup output.
 */
export interface SimDeleteTargetGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
