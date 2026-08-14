import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim ECS ListTaskDefinitions command.
 */
export interface SimListTaskDefinitionsCommand {
  readonly input: SimListTaskDefinitionsCommandInput;
}

/**
 * Minimal structural sim ECS ListTaskDefinitions input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTaskDefinitionsCommand/
 */
export interface SimListTaskDefinitionsCommandInput {
  readonly familyPrefix?: string | undefined;
  readonly status?: string | undefined;
  readonly sort?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * Minimal structural sim ECS ListTaskDefinitions output.
 */
export interface SimListTaskDefinitionsCommandOutput {
  readonly taskDefinitionArns?: readonly SimArn[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
