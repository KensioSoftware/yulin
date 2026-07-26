import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda AddPermission command.
 */
export interface SimAddPermissionCommand {
  readonly input: SimAddPermissionCommandInput;
}

/**
 * Minimal structural sim Lambda AddPermission input.
 */
export interface SimAddPermissionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly StatementId?: string | undefined;
  readonly Action?: string | undefined;
  readonly Principal?: string | undefined;
  readonly FunctionUrlAuthType?: string | undefined;
  readonly SourceArn?: string | undefined;
  readonly SourceAccount?: string | undefined;
  readonly PrincipalOrgID?: string | undefined;
  readonly InvokedViaFunctionUrl?: boolean | undefined;
}

/**
 * Minimal structural sim Lambda AddPermission output.
 *
 * Real Lambda answers with the statement it assembled, as JSON, which is the
 * only place a caller sees what the shorthand it supplied expanded into.
 */
export interface SimAddPermissionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly Statement: string;
}
