import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsClusterDetail } from "../../cluster/sim-ecs-cluster.js";

/**
 * Minimal structural sim ECS DescribeClusters command.
 */
export interface SimDescribeClustersCommand {
  readonly input: SimDescribeClustersCommandInput;
}

/**
 * Minimal structural sim ECS DescribeClusters input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeClustersCommand/
 */
export interface SimDescribeClustersCommandInput {
  readonly clusters?: readonly string[] | undefined;
  readonly include?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ECS failure entry.
 *
 * ECS reports a resource it could not act on here rather than raising, so one
 * request naming several clusters answers for each of them.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Failure.html
 */
export interface SimEcsFailure {
  readonly arn?: string | undefined;
  readonly reason?: string | undefined;
  readonly detail?: string | undefined;
}

/**
 * Minimal structural sim ECS DescribeClusters output.
 */
export interface SimDescribeClustersCommandOutput {
  readonly clusters?: readonly SimEcsClusterDetail[] | undefined;
  readonly failures?: readonly SimEcsFailure[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
