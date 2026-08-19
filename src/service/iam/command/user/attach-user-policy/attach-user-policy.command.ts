export interface SimAttachUserPolicyCommandInput {
  readonly UserName?: string | undefined;
  readonly PolicyArn?: string | undefined;
}

export interface SimAttachUserPolicyCommand {
  readonly input: SimAttachUserPolicyCommandInput;
}

export type SimAttachUserPolicyCommandOutput = Record<string, never>;
