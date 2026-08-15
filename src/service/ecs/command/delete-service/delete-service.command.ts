import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsServiceDetail } from "../../service/sim-ecs-service-detail.js";

/**
 * Minimal structural sim ECS DeleteService command.
 */
export interface SimDeleteServiceCommand {
  readonly input: SimDeleteServiceCommandInput;
}

/**
 * Minimal structural sim ECS DeleteService input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeleteServiceCommand/
 */
export interface SimDeleteServiceCommandInput {
  readonly cluster?: string | undefined;
  readonly service?: string | undefined;
  readonly force?: boolean | undefined;
}

/**
 * Minimal structural sim ECS DeleteService output.
 */
export interface SimDeleteServiceCommandOutput {
  readonly service?: SimEcsServiceDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
