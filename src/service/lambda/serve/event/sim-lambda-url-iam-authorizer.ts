import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import type { SimLambdaFunctionUrlAuthorizerContext } from "./sim-lambda-url-event.type.js";

/**
 * What a Function URL reports as the Account of a caller it did not
 * authenticate, which is every caller of a `NONE` URL.
 */
export const simLambdaUrlAnonymousAccountId = "anonymous";

/**
 * How the caller of a Function URL invocation appears in the event.
 *
 * Real Lambda only ever authenticates an IAM principal at a Function URL, so
 * everything here is derived from the caller's ARN. A caller without one is
 * described the way an unauthenticated caller is, rather than filled in with
 * something no real invocation would carry.
 */
export class SimLambdaUrlIamCaller {
  private readonly caller: SimAwsRequestCaller;

  constructor(caller: SimAwsRequestCaller) {
    this.caller = caller;
  }

  /**
   * The Account this invocation is reported as coming from.
   */
  accountId(): string {
    const arnAccountId = this.arn()?.split(":", 6)[4];

    if (arnAccountId === undefined || arnAccountId.length === 0) {
      return simLambdaUrlAnonymousAccountId;
    }

    return arnAccountId;
  }

  /**
   * The `requestContext.authorizer` block describing this caller, or undefined
   * when there is no IAM principal to describe.
   */
  authorizerContext(): SimLambdaFunctionUrlAuthorizerContext | undefined {
    const arn = this.arn();

    if (arn === undefined) {
      return undefined;
    }

    return {
      iam: {
        accessKey: "",
        accountId: this.accountId(),
        callerId: arn,
        cognitoIdentity: null,
        principalOrgId: null,
        userArn: arn,
        userId: arn,
      },
    };
  }

  private arn(): string | undefined {
    const { principal } = this.caller;

    return principal.kind === "arn" ? principal.arn : undefined;
  }
}
