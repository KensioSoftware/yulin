import type {
  SimIamCommand,
  SimIamListingOutput,
} from "../entity/sim-iam-entity-policy.command.js";
import type { SimIamPageInput } from "../sim-iam-page.js";
import type { SimCreateUserCommandOutput } from "./create-user/create-user.command.js";

export type SimGetUserCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
}>;
export type SimGetUserCommandOutput = SimCreateUserCommandOutput;
export type SimListUsersCommand = SimIamCommand<
  SimIamPageInput & { readonly PathPrefix?: string | undefined }
>;
export interface SimListUsersCommandOutput extends SimIamListingOutput {
  readonly Users: readonly SimGetUserCommandOutput["User"][];
}
export type SimListAccessKeysCommand = SimIamCommand<
  SimIamPageInput & { readonly UserName?: string | undefined }
>;
export interface SimListAccessKeysCommandOutput extends SimIamListingOutput {
  readonly AccessKeyMetadata: readonly {
    readonly UserName: string;
    readonly AccessKeyId: string;
    readonly Status: string;
    readonly CreateDate: Date;
  }[];
}
export type SimAccessKeyCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
  readonly AccessKeyId?: string | undefined;
}>;
export type SimUpdateAccessKeyCommand = SimIamCommand<
  SimAccessKeyCommand["input"] & { readonly Status?: string | undefined }
>;
export type SimLoginProfileCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
}>;
export interface SimGetLoginProfileCommandOutput {
  readonly LoginProfile: {
    readonly UserName: string;
    readonly CreateDate: Date;
    readonly PasswordResetRequired: boolean;
  };
}
