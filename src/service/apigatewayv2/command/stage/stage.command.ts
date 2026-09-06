import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimHttpApiRouteSettings,
  SimHttpApiRouteSettingsMap,
} from "../../api/stage/settings/sim-http-api-route-settings.type.js";
import type { SimHttpApiAccessLogSettingsInput } from "../../api/stage/access-log/sim-http-api-access-log-settings.type.js";
import type { SimHttpApiStageView } from "../../api/stage/sim-http-api-stage.js";

/**
 * Minimal structural sim API Gateway v2 CreateStage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateStageCommand/
 */
export interface SimCreateStageCommand {
  readonly input: SimCreateStageCommandInput;
}

export interface SimCreateStageCommandInput {
  readonly ApiId?: string | undefined;
  readonly StageName?: string | undefined;
  readonly AutoDeploy?: boolean | undefined;
  readonly StageVariables?: Readonly<Record<string, string>> | undefined;
  readonly Description?: string | undefined;
  readonly DefaultRouteSettings?: SimHttpApiRouteSettings | undefined;
  readonly RouteSettings?: SimHttpApiRouteSettingsMap | undefined;
  readonly AccessLogSettings?: SimHttpApiAccessLogSettingsInput | undefined;
}

export interface SimCreateStageCommandOutput extends SimHttpApiStageView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetStages command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetStagesCommand/
 */
export interface SimGetStagesCommand {
  readonly input: SimGetStagesCommandInput;
}

export interface SimGetStagesCommandInput {
  readonly ApiId?: string | undefined;
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetStagesCommandOutput {
  readonly Items: readonly SimHttpApiStageView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteStage command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteStageCommand/
 */
export interface SimDeleteStageCommand {
  readonly input: SimDeleteStageCommandInput;
}

export interface SimDeleteStageCommandInput {
  readonly ApiId?: string | undefined;
  readonly StageName?: string | undefined;
}

export interface SimDeleteStageCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
