import type { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import type { SimPayload2AuthorizerContext } from "./sim-payload-2-event.type.js";

/**
 * What an endpoint reports as the Account of a caller it did not authenticate,
 * which is every caller of an endpoint that admits anyone.
 */
export const simPayload2AnonymousAccountId = "anonymous";

/**
 * How the IAM caller of an invocation appears in the event.
 *
 * Everything here is derived from the caller's ARN. A caller without one is
 * described the way an unauthenticated caller is, rather than filled in with
 * something no real invocation would carry.
 */
export class SimPayload2IamCaller {
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
      return simPayload2AnonymousAccountId;
    }

    return arnAccountId;
  }

  /**
   * The `requestContext.authorizer` block describing this caller, or undefined
   * when there is no IAM principal to describe.
   */
  authorizerContext(): SimPayload2AuthorizerContext | undefined {
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
