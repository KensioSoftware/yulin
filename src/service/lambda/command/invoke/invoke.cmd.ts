/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/InvokeCommand/
 */

import type { Readable } from "node:stream";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda Invoke command.
 */
export interface SimInvokeCommand {
  readonly input: SimInvokeCommandInput;
}

export type SimLambdaInvocationType = "RequestResponse" | "Event" | "DryRun";

/**
 * Minimal supported sim Lambda Invoke payload type.
 * This allows for the different types that Payload could be in the real SDK
 * command, even though only string and Uint8Array payloads are supported.
 */
export type SimInvokePayload =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | Buffer
  | Blob
  | Readable
  | ReadableStream<Uint8Array>;

/**
 * Minimal structural sim Lambda Invoke input.
 */
export interface SimInvokeCommandInput {
  readonly FunctionName?: string | undefined;
  readonly InvocationType?: SimLambdaInvocationType | undefined;
  readonly Payload?: SimInvokePayload | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda Invoke output.
 */
export interface SimInvokeCommandOutput {
  readonly $metadata: SimResponseMetadata;
  StatusCode: number;
  ExecutedVersion?: string | undefined;
  FunctionError?: string | undefined;
  Payload?: Uint8Array | undefined;
}
