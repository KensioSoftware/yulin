import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsServiceDetail } from "../../service/sim-ecs-service-detail.js";
import type { SimEcsFailure } from "../describe-clusters/describe-clusters.command.js";

/**
 * Minimal structural sim ECS DescribeServices command.
 */
export interface SimDescribeServicesCommand {
  readonly input: SimDescribeServicesCommandInput;
}

/**
 * Minimal structural sim ECS DescribeServices input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
 */
export interface SimDescribeServicesCommandInput {
  readonly cluster?: string | undefined;
  readonly services?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ECS DescribeServices output.
 */
export interface SimDescribeServicesCommandOutput {
  readonly services?: readonly SimEcsServiceDetail[] | undefined;
  readonly failures?: readonly SimEcsFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
