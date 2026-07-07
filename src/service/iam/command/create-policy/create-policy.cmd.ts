import type { SimArn } from "../../../aws/arn.js";

export interface SimCreatePolicyCommandInput {
  readonly PolicyName?: string | undefined;
  readonly Path?: string | undefined;
  readonly PolicyDocument?: string | undefined;
  readonly Description?: string | undefined;
}

export interface SimCreatePolicyCommand {
  readonly input: SimCreatePolicyCommandInput;
}

export interface SimCreatePolicyCommandOutput {
  readonly Policy: {
    readonly PolicyName: string;
    readonly PolicyId: string;
    readonly Arn: SimArn;
    readonly Path: string;
    readonly DefaultVersionId: string;
    readonly AttachmentCount: number;
    readonly PermissionsBoundaryUsageCount: number;
    readonly IsAttachable: boolean;
    readonly Description?: string | undefined;
    readonly CreateDate: Date;
    readonly UpdateDate: Date;
  };
}
