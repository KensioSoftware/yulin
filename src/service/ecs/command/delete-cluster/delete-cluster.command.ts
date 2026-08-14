import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsClusterDetail } from "../../cluster/sim-ecs-cluster.js";

/**
 * Minimal structural sim ECS DeleteCluster command.
 */
export interface SimDeleteClusterCommand {
  readonly input: SimDeleteClusterCommandInput;
}

/**
 * Minimal structural sim ECS DeleteCluster input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeleteClusterCommand/
 */
export interface SimDeleteClusterCommandInput {
  readonly cluster?: string | undefined;
}

/**
 * Minimal structural sim ECS DeleteCluster output.
 */
export interface SimDeleteClusterCommandOutput {
  readonly cluster?: SimEcsClusterDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
