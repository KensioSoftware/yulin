import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";
import {
  iamQueryAction,
  iamQueryListing,
  iamQueryListResult,
  iamQueryText,
} from "./sim-iam-query-operation-builders.js";
import { iamQueryBoundaryAndTags } from "./sim-iam-query-tag-operations.js";

const userMembers = ["Path", "UserName", "UserId", "Arn", "CreateDate"];

/**
 * The User operations simulated IAM serves over the Query protocol beyond
 * creating one: reading Users, and their access keys, login profile and
 * boundary.
 */
export function simIamQueryUserEntityOperations(): SimQueryOperations {
  return new Map([
    [
      "GetUser",
      {
        input: iamQueryText("UserName"),
        result: (output): string =>
          iamQueryEntity(output, "User", userMembers, iamQueryBoundaryAndTags),
      },
    ],
    [
      "ListUsers",
      {
        input: iamQueryListing("PathPrefix"),
        result: iamQueryListResult("Users", userMembers),
      },
    ],
    [
      "ListAccessKeys",
      {
        input: iamQueryListing("UserName"),
        result: iamQueryListResult("AccessKeyMetadata", [
          "UserName",
          "AccessKeyId",
          "Status",
          "CreateDate",
        ]),
      },
    ],
    [
      "UpdateAccessKey",
      iamQueryAction(iamQueryText("UserName", "AccessKeyId", "Status")),
    ],
    [
      "DeleteAccessKey",
      iamQueryAction(iamQueryText("UserName", "AccessKeyId")),
    ],
    [
      "GetLoginProfile",
      {
        input: iamQueryText("UserName"),
        result: (output): string =>
          iamQueryEntity(output, "LoginProfile", [
            "UserName",
            "CreateDate",
            "PasswordResetRequired",
          ]),
      },
    ],
    ["DeleteLoginProfile", iamQueryAction(iamQueryText("UserName"))],
    [
      "CreateLoginProfile",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryText("UserName", "Password")(fields),
          PasswordResetRequired: fields.flag("PasswordResetRequired"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "LoginProfile", [
            "UserName",
            "CreateDate",
            "PasswordResetRequired",
          ]),
      },
    ],
    ["DeleteUser", iamQueryAction(iamQueryText("UserName"))],
    ["AttachUserPolicy", iamQueryAction(iamQueryText("UserName", "PolicyArn"))],
    [
      "ListAttachedUserPolicies",
      {
        input: iamQueryListing("UserName", "PathPrefix"),
        result: iamQueryListResult("AttachedPolicies", [
          "PolicyName",
          "PolicyArn",
        ]),
      },
    ],
    [
      "PutUserPermissionsBoundary",
      iamQueryAction(iamQueryText("UserName", "PermissionsBoundary")),
    ],
    ["DeleteUserPermissionsBoundary", iamQueryAction(iamQueryText("UserName"))],
  ]);
}
