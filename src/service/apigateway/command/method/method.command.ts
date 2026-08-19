import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRestApiIntegrationView } from "../../api/method/sim-rest-api-integration.js";
import type { SimRestApiMethodView } from "../../api/method/sim-rest-api-method.js";

/**
 * Minimal structural sim API Gateway PutMethod command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/PutMethodCommand/
 */
export interface SimPutMethodCommand {
  readonly input: SimPutMethodCommandInput;
}

export interface SimPutMethodCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
  readonly authorizationType?: string | undefined;
  readonly authorizerId?: string | undefined;
  readonly apiKeyRequired?: boolean | undefined;
  readonly operationName?: string | undefined;
}

export interface SimPutMethodCommandOutput extends SimRestApiMethodView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetMethod command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetMethodCommand/
 */
export interface SimGetMethodCommand {
  readonly input: SimGetMethodCommandInput;
}

export interface SimGetMethodCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
}

export interface SimGetMethodCommandOutput extends SimRestApiMethodView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway DeleteMethod command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/DeleteMethodCommand/
 */
export interface SimDeleteMethodCommand {
  readonly input: SimDeleteMethodCommandInput;
}

export interface SimDeleteMethodCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
}

export interface SimDeleteMethodCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway PutIntegration command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/PutIntegrationCommand/
 */
export interface SimPutIntegrationCommand {
  readonly input: SimPutIntegrationCommandInput;
}

export interface SimPutIntegrationCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
  readonly type?: string | undefined;
  readonly integrationHttpMethod?: string | undefined;
  readonly uri?: string | undefined;
}

export interface SimPutIntegrationCommandOutput extends SimRestApiIntegrationView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetIntegration command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetIntegrationCommand/
 */
export interface SimGetIntegrationCommand {
  readonly input: SimGetIntegrationCommandInput;
}

export interface SimGetIntegrationCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
}

export interface SimGetIntegrationCommandOutput extends SimRestApiIntegrationView {
  readonly $metadata: SimResponseMetadata;
}
