import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsServiceDetail } from "../../service/sim-ecs-service-detail.js";

/**
 * Minimal structural sim ECS UpdateService command.
 */
export interface SimUpdateServiceCommand {
  readonly input: SimUpdateServiceCommandInput;
}

/**
 * Minimal structural sim ECS UpdateService input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/UpdateServiceCommand/
 */
export interface SimUpdateServiceCommandInput {
  readonly cluster?: string | undefined;
  readonly service?: string | undefined;
  readonly taskDefinition?: string | undefined;
  readonly desiredCount?: number | undefined;
}

/**
 * Minimal structural sim ECS UpdateService output.
 */
export interface SimUpdateServiceCommandOutput {
  readonly service?: SimEcsServiceDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
