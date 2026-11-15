import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRequestTagRecordConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";

/**
 * Authorize a CreateLogGroup request.
 *
 * The tags the request carries reach IAM as `aws:RequestTag/<key>` and
 * `aws:TagKeys`. A request carrying tags needs `logs:TagResource` as well,
 * or the older `logs:TagLogGroup`, which CloudWatch Logs still accepts in its
 * place. Where both are denied, the refusal names `logs:TagResource`.
 * `logs:TagResource` is authorized against the group's ARN without the
 * trailing `:*`, and `logs:TagLogGroup` against the ARN with it.
 */
export function simLogsAuthorizeCreateLogGroup(
  authorizer: SimLogsAuthorizer,
  logGroupName: string,
  tags: Readonly<Record<string, string>> | undefined,
  caller: SimAwsCaller | undefined,
): void {
  const conditions = simIamRequestTagRecordConditions(tags);

  authorizer.authorizeLogGroup(
    "logs:CreateLogGroup",
    logGroupName,
    caller,
    conditions,
  );

  if (Object.keys(tags ?? {}).length === 0) {
    return;
  }

  try {
    authorizer.authorizeLogGroupTagging(
      "logs:TagResource",
      logGroupName,
      caller,
      conditions,
    );
  } catch (error) {
    if (!(error instanceof SimIamAccessDenied)) {
      throw error;
    }

    try {
      authorizer.authorizeLogGroup(
        "logs:TagLogGroup",
        logGroupName,
        caller,
        conditions,
      );
    } catch {
      throw error;
    }
  }
}
