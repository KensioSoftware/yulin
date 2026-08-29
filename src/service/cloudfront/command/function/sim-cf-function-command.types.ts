/**
 * Structural types for the commands that read a CloudFront Function back.
 *
 * ListFunctions, DescribeFunction and GetFunction all address a Function by
 * name and a stage, and answer with the same summary shape, so their types are
 * together here rather than one file each.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/
 */

import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudFrontFunctionRuntime } from "../../cff/sim-cff-configuration.js";
import type { SimCloudFrontFunctionStage } from "../../cff/sim-cff-stage.js";

/**
 * Minimal structural sim CloudFront Function config.
 */
export interface SimCfFunctionConfig {
  Comment: string;
  Runtime: SimCloudFrontFunctionRuntime;
  KeyValueStoreAssociations?: {
    Quantity: number;
    Items: { KeyValueStoreARN: SimArn }[];
  };
}

/**
 * Minimal structural sim CloudFront Function metadata.
 */
export interface SimCfFunctionMetadata {
  FunctionARN: SimArn;
  Stage: SimCloudFrontFunctionStage;
  CreatedTime: Date;
  LastModifiedTime: Date;
}

/**
 * Minimal structural sim CloudFront Function summary.
 */
export interface SimCfFunctionSummary {
  Name: string;
  Status: string;
  FunctionConfig: SimCfFunctionConfig;
  FunctionMetadata: SimCfFunctionMetadata;
}

/**
 * Minimal structural sim CloudFront ListFunctions command.
 */
export interface SimListFunctionsCommand {
  readonly input: {
    readonly Stage?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront ListFunctions output.
 */
export interface SimListFunctionsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  FunctionList: {
    Quantity: number;
    Items: SimCfFunctionSummary[];
  };
}

/**
 * Minimal structural sim CloudFront DescribeFunction command.
 */
export interface SimDescribeFunctionCommand {
  readonly input: {
    readonly Name?: string | undefined;
    readonly Stage?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront DescribeFunction output.
 */
export interface SimDescribeFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  FunctionSummary: SimCfFunctionSummary;
  ETag: string;
}

/**
 * Minimal structural sim CloudFront GetFunction command.
 */
export interface SimGetFunctionCommand {
  readonly input: {
    readonly Name?: string | undefined;
    readonly Stage?: string | undefined;
  };
}

/**
 * Minimal structural sim CloudFront GetFunction output.
 */
export interface SimGetFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  FunctionCode: Uint8Array;
  ETag: string;
  ContentType: string;
}
