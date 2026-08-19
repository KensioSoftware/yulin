import type { Readable } from "node:stream";

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRestApiView } from "../../api/sim-rest-api-view.js";

/**
 * One change an Update command asks for, in the JSON-patch-like shape every
 * API Gateway v1 update takes.
 */
export interface SimRestApiPatchOperation {
  readonly op?: string | undefined;
  readonly path?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * Minimal structural sim API Gateway CreateRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/CreateRestApiCommand/
 */
export interface SimCreateRestApiCommand {
  readonly input: SimCreateRestApiCommandInput;
}

export interface SimCreateRestApiCommandInput {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly disableExecuteApiEndpoint?: boolean | undefined;
}

export interface SimCreateRestApiCommandOutput extends SimRestApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetRestApiCommand/
 */
export interface SimGetRestApiCommand {
  readonly input: SimGetRestApiCommandInput;
}

export interface SimGetRestApiCommandInput {
  readonly restApiId?: string | undefined;
}

export interface SimGetRestApiCommandOutput extends SimRestApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetRestApis command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetRestApisCommand/
 */
export interface SimGetRestApisCommand {
  readonly input: SimGetRestApisCommandInput;
}

export interface SimGetRestApisCommandInput {
  readonly limit?: number | undefined;
  readonly position?: string | undefined;
}

export interface SimGetRestApisCommandOutput {
  readonly items: readonly SimRestApiView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway UpdateRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/UpdateRestApiCommand/
 */
export interface SimUpdateRestApiCommand {
  readonly input: SimUpdateRestApiCommandInput;
}

export interface SimUpdateRestApiCommandInput {
  readonly restApiId?: string | undefined;
  readonly patchOperations?: readonly SimRestApiPatchOperation[] | undefined;
}

export interface SimUpdateRestApiCommandOutput extends SimRestApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway DeleteRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/DeleteRestApiCommand/
 */
export interface SimDeleteRestApiCommand {
  readonly input: SimDeleteRestApiCommandInput;
}

export interface SimDeleteRestApiCommandInput {
  readonly restApiId?: string | undefined;
}

export interface SimDeleteRestApiCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal supported sim REST API definition body type.
 *
 * This allows for the different types the request body could be in the real
 * SDK commands, even though only string and Uint8Array documents are read.
 */
export type SimRestApiDefinitionBody =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | Buffer
  | Blob
  | Readable
  | ReadableStream<Uint8Array>;

/**
 * Minimal structural sim API Gateway ImportRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/ImportRestApiCommand/
 */
export interface SimImportRestApiCommand {
  readonly input: SimImportRestApiCommandInput;
}

export interface SimImportRestApiCommandInput {
  readonly body?: SimRestApiDefinitionBody | undefined;
  readonly failOnWarnings?: boolean | undefined;
  readonly parameters?: Record<string, string> | undefined;
}

export interface SimImportRestApiCommandOutput extends SimRestApiView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway PutRestApi command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/PutRestApiCommand/
 */
export interface SimPutRestApiCommand {
  readonly input: SimPutRestApiCommandInput;
}

export interface SimPutRestApiCommandInput {
  readonly restApiId?: string | undefined;
  readonly mode?: string | undefined;
  readonly body?: SimRestApiDefinitionBody | undefined;
  readonly failOnWarnings?: boolean | undefined;
  readonly parameters?: Record<string, string> | undefined;
}

export interface SimPutRestApiCommandOutput extends SimRestApiView {
  readonly $metadata: SimResponseMetadata;
}
