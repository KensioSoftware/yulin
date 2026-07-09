export interface SimPutRolePolicyCommandInput {
  readonly RoleName?: string | undefined;
  readonly PolicyName?: string | undefined;
  readonly PolicyDocument?: string | undefined;
}

export interface SimPutRolePolicyCommand {
  readonly input: SimPutRolePolicyCommandInput;
}

export type SimPutRolePolicyCommandOutput = Record<string, never>;
