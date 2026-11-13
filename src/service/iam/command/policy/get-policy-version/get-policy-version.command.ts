export interface SimGetPolicyVersionCommandInput {
  readonly PolicyArn?: string | undefined;
  readonly VersionId?: string | undefined;
}

export interface SimGetPolicyVersionCommand {
  readonly input: SimGetPolicyVersionCommandInput;
}

export interface SimGetPolicyVersionCommandOutput {
  readonly PolicyVersion: {
    readonly Document?: string | undefined;
    readonly VersionId: string;
    readonly IsDefaultVersion: boolean;
    readonly CreateDate: Date;
  };
}
