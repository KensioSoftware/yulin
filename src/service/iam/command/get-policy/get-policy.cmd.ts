import type { SimArn } from "../../../aws/arn.js";

export interface SimGetPolicyCommandInput {
  readonly PolicyArn?: string | undefined;
}

export interface SimGetPolicyCommand {
  readonly input: SimGetPolicyCommandInput;
}

export interface SimGetPolicyCommandOutput {
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
