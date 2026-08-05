export interface SimDeleteRolePolicyCommandInput {
  readonly RoleName?: string | undefined;
  readonly PolicyName?: string | undefined;
}

export interface SimDeleteRolePolicyCommand {
  readonly input: SimDeleteRolePolicyCommandInput;
}

export type SimDeleteRolePolicyCommandOutput = Record<string, never>;
