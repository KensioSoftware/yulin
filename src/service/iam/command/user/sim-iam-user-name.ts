import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import { SimIamValidationError } from "../../error/sim-iam.error.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";

/**
 * The User a command names, or the calling User where it names none.
 *
 * IAM answers GetUser, ListAccessKeys and the access key commands for the
 * caller when the request leaves UserName out. A caller that is no User of
 * this Account, such as a Role session, has to name one.
 */
export function simIamUsernameOrCaller(
  username: string | undefined,
  context: {
    readonly accountId: SimAwsAccountId;
    readonly authorizer: SimIamActionAuthorizer;
    readonly options: SimIamRequestOptions | undefined;
  },
): string {
  if (username !== undefined && username.length > 0) {
    return username;
  }

  const callerArn = context.authorizer.callerArn(context.options?.caller);
  const prefix = `arn:aws:iam::${context.accountId}:user/`;

  if (callerArn?.startsWith(prefix) !== true) {
    throw new SimIamValidationError(
      "Must specify userName when calling with non-User credentials",
    );
  }

  return callerArn.slice(callerArn.lastIndexOf("/") + 1);
}
