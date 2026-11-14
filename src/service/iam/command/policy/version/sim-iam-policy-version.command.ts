import type {
  SimIamCommand,
  SimIamListingOutput,
} from "../../entity/sim-iam-entity-policy.command.js";
import type { SimIamPageInput } from "../../sim-iam-page.js";

export type SimCreatePolicyVersionCommand = SimIamCommand<{
  readonly PolicyArn?: string | undefined;
  readonly PolicyDocument?: string | undefined;
  readonly SetAsDefault?: boolean | undefined;
}>;
export type SimPolicyVersionCommand = SimIamCommand<{
  readonly PolicyArn?: string | undefined;
  readonly VersionId?: string | undefined;
}>;
export type SimListPolicyVersionsCommand = SimIamCommand<
  SimIamPageInput & { readonly PolicyArn?: string | undefined }
>;

/**
 * A policy version as IAM describes one in a listing or a create answer.
 */
export interface SimIamPolicyVersionMetadata {
  readonly VersionId: string;
  readonly IsDefaultVersion: boolean;
  readonly CreateDate: Date;
}
export interface SimCreatePolicyVersionCommandOutput {
  readonly PolicyVersion: SimIamPolicyVersionMetadata;
}
export interface SimListPolicyVersionsCommandOutput extends SimIamListingOutput {
  readonly Versions: readonly SimIamPolicyVersionMetadata[];
}
