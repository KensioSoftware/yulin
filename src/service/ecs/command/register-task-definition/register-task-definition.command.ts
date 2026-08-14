import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsContainerDefinitionType } from "../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsTag } from "../../task-definition/sim-ecs-task-definition-parts.js";
import type { SimEcsTaskDefinitionSettingsType } from "../../task-definition/sim-ecs-task-definition-settings.js";
import type { SimEcsTaskDefinitionDetail } from "../../task-definition/sim-ecs-task-definition-detail.js";

/**
 * Minimal structural sim ECS RegisterTaskDefinition command.
 */
export interface SimRegisterTaskDefinitionCommand {
  readonly input: SimRegisterTaskDefinitionCommandInput;
}

/**
 * Minimal structural sim ECS RegisterTaskDefinition input.
 *
 * The settings are the ones a described revision reports back, so registering
 * and describing are two views of the same declaration.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RegisterTaskDefinitionCommand/
 */
export interface SimRegisterTaskDefinitionCommandInput extends SimEcsTaskDefinitionSettingsType {
  readonly family?: string | undefined;
  readonly containerDefinitions?:
    | readonly SimEcsContainerDefinitionType[]
    | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
}

/**
 * Minimal structural sim ECS RegisterTaskDefinition output.
 */
export interface SimRegisterTaskDefinitionCommandOutput {
  readonly taskDefinition?: SimEcsTaskDefinitionDetail | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
