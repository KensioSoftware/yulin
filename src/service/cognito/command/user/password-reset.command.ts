import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoCodeDeliveryDetailsType } from "../../user-pool/message/sim-cognito-code-delivery.js";

export type { SimCognitoCodeDeliveryDetailsType } from "../../user-pool/message/sim-cognito-code-delivery.js";

/**
 * What both client-side password reset operations name: the app client, and
 * the user resetting.
 *
 * There is no `UserPoolId` in either of them. These are what a browser or
 * mobile app calls on behalf of someone who cannot sign in, so an app client
 * id is all they carry, as on real Cognito. `SecretHash` is what a client
 * created with a secret has to send.
 */
export interface SimCognitoPasswordResetCommandInput {
  readonly ClientId?: string | undefined;
  readonly Username?: string | undefined;
  readonly SecretHash?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
  readonly UserContextData?: object | undefined;
}

/**
 * Minimal structural sim Cognito ForgotPassword command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/ForgotPasswordCommand/
 */
export interface SimForgotPasswordCommand {
  readonly input: SimCognitoPasswordResetCommandInput;
}

/**
 * Where the pool sent the reset code.
 *
 * The destination is masked, as real Cognito masks it. The code itself is read
 * back off the pool, because nothing here delivers the message carrying it.
 */
export interface SimForgotPasswordCommandOutput {
  readonly CodeDeliveryDetails?: SimCognitoCodeDeliveryDetailsType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The ConfirmForgotPassword inputs this simulation reads, and the ones it
 * refuses.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/ConfirmForgotPasswordCommand/
 */
export interface SimConfirmForgotPasswordCommandInput extends SimCognitoPasswordResetCommandInput {
  readonly ConfirmationCode?: string | undefined;
  readonly Password?: string | undefined;
}

/**
 * Minimal structural sim Cognito ConfirmForgotPassword command.
 */
export interface SimConfirmForgotPasswordCommand {
  readonly input: SimConfirmForgotPasswordCommandInput;
}

export interface SimConfirmForgotPasswordCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminResetUserPassword inputs, which are all simulated.
 *
 * This is the administrative side of a reset, so it names the pool and the
 * user rather than an app client.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/AdminResetUserPasswordCommand/
 */
export interface SimAdminResetUserPasswordCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Minimal structural sim Cognito AdminResetUserPassword command.
 */
export interface SimAdminResetUserPasswordCommand {
  readonly input: SimAdminResetUserPasswordCommandInput;
}

export interface SimAdminResetUserPasswordCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
