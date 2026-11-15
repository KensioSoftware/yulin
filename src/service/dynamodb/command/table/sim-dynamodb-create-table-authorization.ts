import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simIamTagOnCreate } from "../../../iam/tag/sim-iam-tag-on-create.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";
import type { SimDynamoDbTagInput } from "./table.types.js";

/**
 * Ensure the caller may create a table, and tag it where the request carries
 * at least one tag, which takes `dynamodb:TagResource` as well.
 *
 * Both actions see the tags as `aws:RequestTag/<key>` and their keys as
 * `aws:TagKeys`.
 */
export function simDynamoDbAuthorizeCreateTable(
  authorizer: SimDynamoDbAuthorizer,
  tableName: string,
  tags: readonly SimDynamoDbTagInput[] | undefined,
  caller: SimAwsCaller | undefined,
): void {
  const request = simIamTagOnCreate(
    "dynamodb:CreateTable",
    "dynamodb:TagResource",
    tags,
  );

  for (const action of request.actions) {
    authorizer.authorizeTable(action, tableName, caller, {
      requestConditions: request.conditions,
    });
  }
}
