/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PublishVersionCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda PublishVersion command.
 */
export interface SimPublishVersionCommand {
  readonly input: SimPublishVersionCommandInput;
}

/**
 * Minimal structural sim Lambda PublishVersion input.
 *
 * A `Description` describes the version rather than the function it was
 * published from, so the version keeps the function's own description when
 * none is given.
 *
 * `RevisionId` publishes only a function still at that revision, and
 * `CodeSha256` only one whose code still has that digest.
 */
export interface SimPublishVersionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Description?: string | undefined;
  readonly RevisionId?: string | undefined;
  readonly CodeSha256?: string | undefined;
}

/**
 * Minimal structural sim Lambda PublishVersion output, which is the published
 * version's own configuration.
 */
export interface SimPublishVersionCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}
