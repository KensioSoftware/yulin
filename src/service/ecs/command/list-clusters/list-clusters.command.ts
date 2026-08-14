import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim ECS ListClusters command.
 */
export interface SimListClustersCommand {
  readonly input: SimListClustersCommandInput;
}

/**
 * Minimal structural sim ECS ListClusters input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListClustersCommand/
 */
export interface SimListClustersCommandInput {
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * Minimal structural sim ECS ListClusters output.
 */
export interface SimListClustersCommandOutput {
  readonly clusterArns?: readonly SimArn[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
