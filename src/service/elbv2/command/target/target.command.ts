import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2TargetDescription } from "../../target-group/sim-elbv2-target.js";

/**
 * Minimal structural sim ELBv2 RegisterTargets command.
 */
export interface SimRegisterTargetsCommand {
  readonly input: SimRegisterTargetsCommandInput;
}

/**
 * Minimal structural sim ELBv2 RegisterTargets input.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_RegisterTargets.html
 */
export interface SimRegisterTargetsCommandInput {
  readonly TargetGroupArn?: string | undefined;
  readonly Targets?: readonly SimElbV2TargetDescription[] | undefined;
}

/**
 * Minimal structural sim ELBv2 RegisterTargets output.
 */
export interface SimRegisterTargetsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DeregisterTargets command.
 */
export interface SimDeregisterTargetsCommand {
  readonly input: SimDeregisterTargetsCommandInput;
}

/**
 * Minimal structural sim ELBv2 DeregisterTargets input.
 */
export interface SimDeregisterTargetsCommandInput {
  readonly TargetGroupArn?: string | undefined;
  readonly Targets?: readonly SimElbV2TargetDescription[] | undefined;
}

/**
 * Minimal structural sim ELBv2 DeregisterTargets output.
 */
export interface SimDeregisterTargetsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetHealth command.
 */
export interface SimDescribeTargetHealthCommand {
  readonly input: SimDescribeTargetHealthCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetHealth input.
 */
export interface SimDescribeTargetHealthCommandInput {
  readonly TargetGroupArn?: string | undefined;
  readonly Targets?: readonly SimElbV2TargetDescription[] | undefined;
}

/**
 * Minimal structural sim ELBv2 target health.
 */
export interface SimElbV2TargetHealth {
  readonly State: string;
  readonly Description?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 target health description.
 */
export interface SimElbV2TargetHealthDescription {
  readonly Target: SimElbV2TargetDescription;
  readonly TargetHealth: SimElbV2TargetHealth;
}

/**
 * Minimal structural sim ELBv2 DescribeTargetHealth output.
 */
export interface SimDescribeTargetHealthCommandOutput {
  readonly TargetHealthDescriptions?:
    | readonly SimElbV2TargetHealthDescription[]
    | undefined;
  readonly $metadata: SimResponseMetadata;
}
