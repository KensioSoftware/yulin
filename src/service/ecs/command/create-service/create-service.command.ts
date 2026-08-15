import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimEcsServiceDetail } from "../../service/sim-ecs-service-detail.js";

/**
 * Minimal structural sim ECS CreateService command.
 */
export interface SimCreateServiceCommand {
  readonly input: SimCreateServiceCommandInput;
}

/**
 * Minimal structural sim ECS CreateService input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/CreateServiceCommand/
 */
export interface SimCreateServiceCommandInput {
  readonly cluster?: string | undefined;
  readonly serviceName?: string | undefined;
  readonly taskDefinition?: string | undefined;
  readonly desiredCount?: number | undefined;
  readonly launchType?: string | undefined;
  readonly schedulingStrategy?: string | undefined;
}

/**
 * Minimal structural sim ECS CreateService output.
 */
export interface SimCreateServiceCommandOutput {
  readonly service?: SimEcsServiceDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}
