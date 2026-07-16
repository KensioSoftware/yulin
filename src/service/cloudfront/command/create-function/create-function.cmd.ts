/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateFunctionCommand/
 */

import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudFront CreateFunction command.
 */
export interface SimCreateFunctionCommand {
  readonly input: SimCreateFunctionCommandInput;
}

/**
 * Minimal structural sim CloudFront CreateFunction input.
 */
export interface SimCreateFunctionCommandInput {
  readonly Name?: string | undefined;
  FunctionConfig?:
    | undefined
    | {
        Comment?: string | undefined;
        Runtime?: "cloudfront-js-1.0" | "cloudfront-js-2.0" | undefined;
      };
  FunctionCode?: Uint8Array | undefined;
}

/**
 * Minimal structural sim CloudFront CreateFunction output.
 */
export interface SimCreateFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  FunctionSummary: SimCloudFrontFunctionSummary;
  FunctionMetadata: SimCloudFrontFunctionMetadata;
}

/**
 * Minimal structural sim CloudFront Function summary.
 */
export interface SimCloudFrontFunctionSummary {
  Name: string;
  Status: string;
}

/**
 * Minimal structural sim CloudFront Function metadata.
 */
export interface SimCloudFrontFunctionMetadata {
  FunctionARN: SimArn;
}
