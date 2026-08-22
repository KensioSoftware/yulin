import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRestApiDeploymentView } from "../../api/deployment/sim-rest-api-deployment.js";
import type { SimRestApiMethodSettingsMap } from "../../api/stage/settings/sim-rest-api-method-settings.type.js";
import type { SimRestApiStageView } from "../../api/stage/sim-rest-api-stage.js";

/**
 * Minimal structural sim API Gateway CreateDeployment command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/CreateDeploymentCommand/
 */
export interface SimCreateDeploymentCommand {
  readonly input: SimCreateDeploymentCommandInput;
}

export interface SimCreateDeploymentCommandInput {
  readonly restApiId?: string | undefined;
  readonly stageName?: string | undefined;
  readonly description?: string | undefined;
  readonly stageDescription?: string | undefined;
  readonly variables?: Readonly<Record<string, string>> | undefined;
}

export interface SimCreateDeploymentCommandOutput extends SimRestApiDeploymentView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway CreateStage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/CreateStageCommand/
 */
export interface SimCreateStageCommand {
  readonly input: SimCreateStageCommandInput;
}

export interface SimCreateStageCommandInput {
  readonly restApiId?: string | undefined;
  readonly stageName?: string | undefined;
  readonly deploymentId?: string | undefined;
  readonly description?: string | undefined;
  readonly variables?: Readonly<Record<string, string>> | undefined;
  /**
   * The throttle of each method, keyed `{resourcePath}/{httpMethod}`, with the
   * key of two stars as the stage default.
   *
   * Real CreateStage takes no such member. API Gateway sets these through
   * UpdateStage patch operations, which are outside this simulation, and
   * through the `MethodSettings` of an AWS::ApiGateway::Stage. This is here so
   * that a test can throttle a stage without a template.
   */
  readonly methodSettings?: SimRestApiMethodSettingsMap | undefined;
}

export interface SimCreateStageCommandOutput extends SimRestApiStageView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetStage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetStageCommand/
 */
export interface SimGetStageCommand {
  readonly input: SimGetStageCommandInput;
}

export interface SimGetStageCommandInput {
  readonly restApiId?: string | undefined;
  readonly stageName?: string | undefined;
}

export interface SimGetStageCommandOutput extends SimRestApiStageView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetStages command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetStagesCommand/
 */
export interface SimGetStagesCommand {
  readonly input: SimGetStagesCommandInput;
}

export interface SimGetStagesCommandInput {
  readonly restApiId?: string | undefined;
  readonly deploymentId?: string | undefined;
}

export interface SimGetStagesCommandOutput {
  readonly item: readonly SimRestApiStageView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway DeleteStage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/DeleteStageCommand/
 */
export interface SimDeleteStageCommand {
  readonly input: SimDeleteStageCommandInput;
}

export interface SimDeleteStageCommandInput {
  readonly restApiId?: string | undefined;
  readonly stageName?: string | undefined;
}

export interface SimDeleteStageCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
