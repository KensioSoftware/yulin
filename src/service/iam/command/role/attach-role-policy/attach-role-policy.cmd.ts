export interface SimAttachRolePolicyCommandInput {
  readonly RoleName?: string | undefined;
  readonly PolicyArn?: string | undefined;
}

export interface SimAttachRolePolicyCommand {
  readonly input: SimAttachRolePolicyCommandInput;
}

export type SimAttachRolePolicyCommandOutput = Record<string, never>;
