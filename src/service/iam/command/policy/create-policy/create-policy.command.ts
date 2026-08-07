import type { SimArn } from "../../../../aws/arn.js";
import type { JSONString } from "../../../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "../../../policy/sim-iam-policy.js";

export interface SimCreatePolicyCommandInput {
  readonly PolicyName?: string | undefined;
  readonly Path?: string | undefined;
  readonly PolicyDocument?:
    | JSONString<SimIamPolicyDocument>
    | string
    | undefined;
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
