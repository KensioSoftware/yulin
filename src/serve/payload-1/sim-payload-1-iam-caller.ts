import type { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import type { SimPayload1Identity } from "./sim-payload-1-event.type.js";

/**
 * The `requestContext.identity` fields describing the caller of an `AWS_IAM`
 * method, which are `null` for a request nobody authorized.
 */
type SimPayload1IdentityCaller = Pick<
  SimPayload1Identity,
  "accountId" | "caller" | "user" | "userArn"
>;

/**
 * How the IAM caller of a payload format 1.0 invocation appears in the event.
 *
 * Everything here is derived from the caller's ARN. Real API Gateway puts the
 * unique id of the principal, `AIDA...` for a User, in `caller` and `user`,
 * and the simulator has no such id to give, so the ARN identifying the caller
 * goes in each field it can honestly fill. A caller without an ARN is described
 * the way an unauthenticated one is rather than filled in with something no
 * real invocation would carry.
 */
export class SimPayload1IamCaller {
  private readonly caller: SimAwsRequestCaller | undefined;

  /**
   * An absent caller is one nothing authenticated, which is every caller of a
   * method that authorizes nobody.
   */
  constructor(caller: SimAwsRequestCaller | undefined) {
    this.caller = caller;
  }

  /**
   * The identity fields naming this caller, or `null` in each of them where
   * there is no IAM principal to name.
   */
  identity(): SimPayload1IdentityCaller {
    const arn = this.arn();

    if (arn === undefined) {
      return { accountId: null, caller: null, user: null, userArn: null };
    }

    return {
      accountId: this.accountId(arn),
      caller: arn,
      user: arn,
      userArn: arn,
    };
  }

  /**
   * The Account of the principal the request was attributed to, which is the
   * caller's own rather than the API's, and `null` for an ARN carrying none.
   */
  private accountId(arn: string): string | null {
    const arnAccountId = arn.split(":", 6)[4];

    return arnAccountId === undefined || arnAccountId.length === 0
      ? null
      : arnAccountId;
  }

  private arn(): string | undefined {
    const principal = this.caller?.principal;

    return principal?.kind === "arn" ? principal.arn : undefined;
  }
}
