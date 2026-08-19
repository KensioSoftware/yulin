import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRestApiResourceView } from "../../api/resource/sim-rest-api-resource.js";

/**
 * Minimal structural sim API Gateway CreateResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/CreateResourceCommand/
 */
export interface SimCreateResourceCommand {
  readonly input: SimCreateResourceCommandInput;
}

export interface SimCreateResourceCommandInput {
  readonly restApiId?: string | undefined;
  readonly parentId?: string | undefined;
  readonly pathPart?: string | undefined;
}

export interface SimCreateResourceCommandOutput extends SimRestApiResourceView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetResourceCommand/
 */
export interface SimGetResourceCommand {
  readonly input: SimGetResourceCommandInput;
}

export interface SimGetResourceCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly embed?: readonly string[] | undefined;
}

export interface SimGetResourceCommandOutput extends SimRestApiResourceView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetResources command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetResourcesCommand/
 */
export interface SimGetResourcesCommand {
  readonly input: SimGetResourcesCommandInput;
}

export interface SimGetResourcesCommandInput {
  readonly restApiId?: string | undefined;
  readonly embed?: readonly string[] | undefined;
  readonly limit?: number | undefined;
  readonly position?: string | undefined;
}

export interface SimGetResourcesCommandOutput {
  readonly items: readonly SimRestApiResourceView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway DeleteResource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/DeleteResourceCommand/
 */
export interface SimDeleteResourceCommand {
  readonly input: SimDeleteResourceCommandInput;
}

export interface SimDeleteResourceCommandInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
}

export interface SimDeleteResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
