import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda GetPolicy command.
 */
export interface SimGetPolicyCommand {
  readonly input: SimGetPolicyCommandInput;
}

/**
 * Minimal structural sim Lambda GetPolicy input.
 */
export interface SimGetPolicyCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetPolicy output.
 */
export interface SimGetPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly Policy: string;
  readonly RevisionId: string;
}
