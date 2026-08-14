import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsTaskDefinitionDetail } from "../../task-definition/sim-ecs-task-definition-detail.js";

/**
 * Minimal structural sim ECS DeregisterTaskDefinition command.
 */
export interface SimDeregisterTaskDefinitionCommand {
  readonly input: SimDeregisterTaskDefinitionCommandInput;
}

/**
 * Minimal structural sim ECS DeregisterTaskDefinition input.
 *
 * `taskDefinition` takes a `family:revision` or a full ARN. A family on its
 * own is not enough, because deregistering is done to one revision.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeregisterTaskDefinitionCommand/
 */
export interface SimDeregisterTaskDefinitionCommandInput {
  readonly taskDefinition?: string | undefined;
}

/**
 * Minimal structural sim ECS DeregisterTaskDefinition output.
 */
export interface SimDeregisterTaskDefinitionCommandOutput {
  readonly taskDefinition?: SimEcsTaskDefinitionDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
