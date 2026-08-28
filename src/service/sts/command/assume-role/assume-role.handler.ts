import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimIamAccountResolver } from "../../../iam/registry/sim-iam-account-resolver.js";
import type {
  SimAssumeRoleCommand,
  SimAssumeRoleCommandOutput,
} from "./assume-role.command.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import { makeSimAwsAccountRootPrincipal } from "../../../aws/caller/sim-aws-account-root-principal.js";
import { SimStsAssumeRoleSessionCreator } from "../../assume/sim-sts-assume-role-session-creator.js";
import { SimStsAssumeRoleRequestParser } from "../../assume/sim-sts-assume-role-request-parser.js";
import { SimAwsCallerResolver } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { AssumeRoleAuthorizationCoordinator } from "../../auth-z/assume-role-auth-z-coordinator.js";

interface AssumeRoleCommandHandlerProperties {
  readonly sourceAccountId: SimAwsAccountId;

  /**
   * The Region this STS is in, which is the Region its requests are made in.
   */
  readonly regionName: AwsRegionName;

  readonly iamResolver: SimIamAccountResolver;
  readonly background?: BackgroundScheduler;

  /**
   * The caller this simulation attributes a request naming none to.
   */
  readonly defaultCaller?: SimAwsCaller | undefined;
}

/**
 * STS AssumeRoleCommand handler.
 *
 * Resolves the source caller and target Role, authorizes the caller's identity
 * policies and the Role trust policy, then delegates temporary session creation
 * and response mapping to `AssumeRoleSessionCreator`.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/AssumeRoleCommand/
 */
export class AssumeRoleCommandHandler implements CommandHandler<
  SimAssumeRoleCommand,
  SimAssumeRoleCommandOutput
> {
  private readonly background: BackgroundScheduler;
  private readonly callerResolver: SimAwsCallerResolver;
  private readonly requestParser = new SimStsAssumeRoleRequestParser();
  private readonly authorizationCoordinator: AssumeRoleAuthorizationCoordinator;
  private readonly sessionCreator: SimStsAssumeRoleSessionCreator;
  private readonly sourceAccountId: SimAwsAccountId;

  constructor(properties: AssumeRoleCommandHandlerProperties) {
    const {
      sourceAccountId,
      regionName,
      iamResolver,
      background = new BackgroundTasks(),
    } = properties;

    this.sourceAccountId = sourceAccountId;
    this.background = background;
    this.callerResolver = new SimAwsCallerResolver({
      credentialIdentityResolver:
        iamResolver.findIamForAccount(sourceAccountId)?.credentials,
      defaultCaller: properties.defaultCaller,
    });
    this.authorizationCoordinator = new AssumeRoleAuthorizationCoordinator({
      sourceAccountId,
      iamResolver,
      regionName,
    });
    this.sessionCreator = new SimStsAssumeRoleSessionCreator({
      iamResolver,
      clock: background,
    });
  }

  /**
   * Handle an AssumeRoleCommand from the SDK.
   *
   * The request parser validates and normalizes SDK input before this method
   * coordinates authorization and temporary session creation.
   */
  async handle(
    command: SimAssumeRoleCommand,
    options?: {
      caller?: SimAwsCaller;
    },
  ): Promise<SimAssumeRoleCommandOutput> {
    const request = this.requestParser.parse(command);
    const caller = this.callerResolver.resolve(
      options?.caller,
      makeSimAwsAccountRootPrincipal(this.sourceAccountId),
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    if (caller.principal.kind !== "arn") {
      throw new SimIamAccessDenied({
        principal: caller.principal,
        action: "sts:AssumeRole",
        resource: request.roleArn,
      });
    }

    const role = await this.authorizationCoordinator.authorize({
      roleArn: request.roleArn,
      roleArnParts: request.roleArnParts,
      caller: caller.principal,
      conditionContext: request.conditionContext,
    });

    return this.sessionCreator.create({
      roleArnParts: request.roleArnParts,
      role,
      roleSessionName: request.roleSessionName,
      sourcePrincipal: caller.principal,
      durationSeconds: request.durationSeconds,
    });
  }
}
