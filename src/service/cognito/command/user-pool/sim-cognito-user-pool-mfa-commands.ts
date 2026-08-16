import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type {
  SimGetUserPoolMfaConfigCommand,
  SimGetUserPoolMfaConfigCommandOutput,
  SimSetUserPoolMfaConfigCommand,
  SimSetUserPoolMfaConfigCommandInput,
  SimSetUserPoolMfaConfigCommandOutput,
} from "./user-pool-mfa.command.js";

interface SimCognitoUserPoolMfaCommandsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that set and read a pool's multi-factor authentication.
 *
 * They are separate from the pool commands because the configuration they act
 * on is separate: `CreateUserPool` carries an `MfaConfiguration` and nothing
 * about the factors behind it, and this is where a pool is told which factors
 * it offers. CloudFormation deploys a pool with MFA in the same two steps.
 *
 * Neither command simulates a challenge. What they change is what
 * `DescribeUserPool` and `GetUserPoolMfaConfig` report, and whether a sign-in
 * to the pool is refused for a challenge this simulation cannot issue.
 */
export class SimCognitoUserPoolMfaCommands {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "SetUserPoolMfaConfig",
  );

  constructor(properties: SimCognitoUserPoolMfaCommandsProperties) {
    this.pools = properties.pools;
    this.authorizer = properties.authorizer;
  }

  /**
   * Set a pool's MFA configuration.
   *
   * The configuration is replaced rather than merged, as real Cognito replaces
   * it: a factor the request leaves out goes back to being unconfigured.
   */
  set(
    command: SimSetUserPoolMfaConfigCommand,
    options?: SimCognitoCommandOptions,
  ): SimSetUserPoolMfaConfigCommandOutput {
    const { input } = command;
    const userPoolId = requireSimCognitoUserPoolId(input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:SetUserPoolMfaConfig",
      userPoolId,
      options?.caller,
    );
    this.refuseUnsimulatedFactors(input);

    const pool = this.pools.require(userPoolId);

    pool.settings.mfa.set(input);

    return { $metadata: {}, ...pool.settings.mfa.toOutput() };
  }

  /**
   * Read a pool's MFA configuration.
   */
  get(
    command: SimGetUserPoolMfaConfigCommand,
    options?: SimCognitoCommandOptions,
  ): SimGetUserPoolMfaConfigCommandOutput {
    const userPoolId = requireSimCognitoUserPoolId(command.input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:GetUserPoolMfaConfig",
      userPoolId,
      options?.caller,
    );

    return {
      $metadata: {},
      ...this.pools.require(userPoolId).settings.mfa.toOutput(),
    };
  }

  /**
   * Refuse the factors this simulation has no way to present.
   *
   * The SNS caller role inside an `SmsMfaConfiguration` is refused in the same
   * words `CreateUserPool` refuses the pool's own `SmsConfiguration`: nothing
   * here delivers a message, so a role recorded here would never be assumed.
   * The factor itself is accepted without one, and the pool records the
   * message it would have sent in the way it records every other one.
   *
   * A pool here has no `EmailConfiguration` either, because `CreateUserPool`
   * refuses that, so real Cognito would refuse a code sent by email on a pool
   * built the same way. A passkey is presented through the `USER_AUTH` flow,
   * which is refused as a flow of its own, so a pool configured for one here
   * would never be asked for it.
   */
  private refuseUnsimulatedFactors(
    input: SimSetUserPoolMfaConfigCommandInput,
  ): void {
    this.unsimulated.refuse(
      "SmsMfaConfiguration.SmsConfiguration",
      input.SmsMfaConfiguration?.SmsConfiguration,
      "the IAM role Cognito assumes to send a text message, which no pool " +
        "here needs because no message is delivered",
    );
    this.unsimulated.refuse(
      "EmailMfaConfiguration",
      input.EmailMfaConfiguration,
      "a second factor sent by email, which needs the pool's EmailConfiguration",
    );
    this.unsimulated.refuse(
      "WebAuthnConfiguration",
      input.WebAuthnConfiguration,
      "signing in with a passkey, which the unsimulated USER_AUTH flow presents",
    );
  }
}
