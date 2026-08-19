export interface SimCreateLoginProfileCommandInput {
  readonly UserName?: string | undefined;
  readonly Password?: string | undefined;
  readonly PasswordResetRequired?: boolean | undefined;
}

export interface SimCreateLoginProfileCommand {
  readonly input: SimCreateLoginProfileCommandInput;
}

export interface SimCreateLoginProfileCommandOutput {
  readonly LoginProfile: {
    readonly UserName: string;
    readonly CreateDate: Date;
    readonly PasswordResetRequired: boolean;
  };
}
