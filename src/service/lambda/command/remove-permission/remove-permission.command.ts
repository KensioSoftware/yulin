import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda RemovePermission command.
 */
export interface SimRemovePermissionCommand {
  readonly input: SimRemovePermissionCommandInput;
}

/**
 * Minimal structural sim Lambda RemovePermission input.
 */
export interface SimRemovePermissionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
  readonly StatementId?: string | undefined;
}

/**
 * Minimal structural sim Lambda RemovePermission output.
 */
export interface SimRemovePermissionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
