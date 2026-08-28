import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimAwsCallerResolver } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type {
  SimAwsCaller,
  SimAwsDefaultCaller,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeSimAwsAccountRootPrincipal } from "../../../aws/caller/sim-aws-account-root-principal.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimIamAccountResolver } from "../../../iam/registry/sim-iam-account-resolver.js";
import type {
  SimGetCallerIdentityCommand,
  SimGetCallerIdentityCommandOutput,
} from "./get-caller-identity.command.js";
import { simStsCallerUserId } from "./sim-sts-caller-user-id.js";

interface GetCallerIdentityCommandHandlerProperties {
  readonly sourceAccountId: SimAwsAccountId;
  readonly iamResolver: SimIamAccountResolver;

  /**
   * The caller this simulation attributes a request naming none to.
   */
  readonly defaultCaller?: SimAwsDefaultCaller | undefined;
}

/**
 * Simulated STS GetCallerIdentity handler.
 *
 * The operation reports who the simulator decided the caller is. Real STS
 * needs no permission for it, which is what makes it the call people reach for
 * to check that credentials and an endpoint are wired up correctly, so this
 * authorizes nothing either.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/GetCallerIdentityCommand/
 */
export class GetCallerIdentityCommandHandler implements CommandHandler<
  SimGetCallerIdentityCommand,
  SimGetCallerIdentityCommandOutput
> {
  private readonly callerResolver: SimAwsCallerResolver;
  private readonly sourceAccountId: SimAwsAccountId;
  private readonly iamResolver: SimIamAccountResolver;

  constructor(properties: GetCallerIdentityCommandHandlerProperties) {
    this.sourceAccountId = properties.sourceAccountId;
    this.iamResolver = properties.iamResolver;
    this.callerResolver = new SimAwsCallerResolver({
      defaultCaller: properties.defaultCaller,
    });
  }

  /**
   * Report the identity behind this request.
   *
   * A caller with no identity has none to report. Real STS answers an
   * unsigned request by refusing the signature, and the simulator reaches the
   * same place by way of the anonymous principal a served request resolves to.
   */
  // oxlint-disable-next-line require-await -- the handler contract is asynchronous
  async handle(
    _command: SimGetCallerIdentityCommand,
    options?: { caller?: SimAwsCaller },
  ): Promise<SimGetCallerIdentityCommandOutput> {
    const caller = this.callerResolver.resolve(
      options?.caller,
      makeSimAwsAccountRootPrincipal(this.sourceAccountId),
    );

    if (caller.principal.kind !== "arn") {
      throw new SimIamAccessDenied({
        principal: caller.principal,
        action: "sts:GetCallerIdentity",
        resource: "*",
      });
    }

    const accountId = (caller.accountId ??
      this.sourceAccountId) as SimAwsAccountId;

    return {
      Arn: caller.arn,
      Account: accountId,
      ...simStsCallerUserId(caller.arn, accountId, this.iamResolver),
      $metadata: {},
    };
  }
}
