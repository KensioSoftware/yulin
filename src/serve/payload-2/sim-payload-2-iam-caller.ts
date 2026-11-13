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
 * The Account and user ARN come from the caller's ARN. The access key, the
 * unique id and the organization come from what simulated AWS resolved the
 * caller to, and a caller it has no record of reports the ARN in place of the
 * unique id. A caller without an ARN is described the way an unauthenticated
 * caller is, rather than filled in with something no real invocation would
 * carry.
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

    const {
      accessKeyId = "",
      userId = arn,
      principalOrgId = null,
    } = this.caller.details;

    return {
      iam: {
        accessKey: accessKeyId,
        accountId: this.accountId(),
        callerId: userId,
        cognitoIdentity: null,
        principalOrgId,
        userArn: arn,
        userId,
      },
    };
  }

  private arn(): string | undefined {
    const { principal } = this.caller;

    return principal.kind === "arn" ? principal.arn : undefined;
  }
}
