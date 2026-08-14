import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimEcsClusterDetail,
  SimEcsClusterSetting,
} from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsTag } from "../../task-definition/sim-ecs-task-definition-parts.js";

/**
 * Minimal structural sim ECS CreateCluster command.
 */
export interface SimCreateClusterCommand {
  readonly input: SimCreateClusterCommandInput;
}

/**
 * Minimal structural sim ECS CreateCluster input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/CreateClusterCommand/
 */
export interface SimCreateClusterCommandInput {
  readonly clusterName?: string | undefined;
  readonly settings?: readonly SimEcsClusterSetting[] | undefined;
  readonly configuration?: object | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
}

/**
 * Minimal structural sim ECS CreateCluster output.
 */
export interface SimCreateClusterCommandOutput {
  readonly cluster?: SimEcsClusterDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
