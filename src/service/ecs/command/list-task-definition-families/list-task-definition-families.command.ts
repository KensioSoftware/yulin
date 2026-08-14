import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim ECS ListTaskDefinitionFamilies command.
 */
export interface SimListTaskDefinitionFamiliesCommand {
  readonly input: SimListTaskDefinitionFamiliesCommandInput;
}

/**
 * Minimal structural sim ECS ListTaskDefinitionFamilies input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTaskDefinitionFamiliesCommand/
 */
export interface SimListTaskDefinitionFamiliesCommandInput {
  readonly familyPrefix?: string | undefined;
  readonly status?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * Minimal structural sim ECS ListTaskDefinitionFamilies output.
 */
export interface SimListTaskDefinitionFamiliesCommandOutput {
  readonly families?: readonly string[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
