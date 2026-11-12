/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetAccountSettingsCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda GetAccountSettings command, which takes no
 * input of its own.
 */
export interface SimGetAccountSettingsCommand {
  readonly input: object;
}

/**
 * The limits an Account has in a Region.
 */
export interface SimLambdaAccountLimit {
  readonly TotalCodeSize: number;
  readonly CodeSizeUnzipped: number;
  readonly CodeSizeZipped: number;
  readonly ConcurrentExecutions: number;
  readonly UnreservedConcurrentExecutions: number;
}

/**
 * What an Account uses of those limits in a Region.
 */
export interface SimLambdaAccountUsage {
  readonly TotalCodeSize: number;
  readonly FunctionCount: number;
}

/**
 * Minimal structural sim Lambda GetAccountSettings output.
 */
export interface SimGetAccountSettingsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly AccountLimit: SimLambdaAccountLimit;
  readonly AccountUsage: SimLambdaAccountUsage;
}
