import type { SimArn } from "../../../../aws/arn.js";

export interface SimCreateUserCommandInput {
  readonly UserName?: string | undefined;
  readonly Path?: string | undefined;
}

export interface SimCreateUserCommand {
  readonly input: SimCreateUserCommandInput;
}

export interface SimCreateUserCommandOutput {
  readonly User: {
    readonly Path: string;
    readonly UserName: string;
    readonly UserId: string;
    readonly Arn: SimArn;
    readonly CreateDate: Date;
  };
}
