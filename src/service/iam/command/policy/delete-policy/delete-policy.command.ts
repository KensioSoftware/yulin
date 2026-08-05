export interface SimDeletePolicyCommandInput {
  readonly PolicyArn?: string | undefined;
}

export interface SimDeletePolicyCommand {
  readonly input: SimDeletePolicyCommandInput;
}

export type SimDeletePolicyCommandOutput = Record<string, never>;
