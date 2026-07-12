import type { SimIamAccessKeyStatus } from "../../../credential/sim-iam-access-key.js";

export interface SimCreateAccessKeyCommandInput {
  readonly UserName?: string | undefined;
}

export interface SimCreateAccessKeyCommand {
  readonly input: SimCreateAccessKeyCommandInput;
}

export interface SimCreateAccessKeyCommandOutput {
  readonly AccessKey: {
    readonly UserName: string;
    readonly AccessKeyId: string;
    readonly Status: SimIamAccessKeyStatus;
    readonly SecretAccessKey: string;
    readonly CreateDate: Date;
  };
}
