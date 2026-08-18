import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim STS GetCallerIdentity command.
 *
 * The operation takes no input. Everything it answers with comes from who the
 * request was made by.
 */
export interface SimGetCallerIdentityCommand {
  readonly input?: Record<string, never> | undefined;
}

/**
 * Minimal structural sim STS GetCallerIdentity output.
 */
export interface SimGetCallerIdentityCommandOutput {
  readonly UserId?: string | undefined;
  readonly Account?: string | undefined;
  readonly Arn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
