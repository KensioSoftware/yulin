import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";
import {
  iamQueryAction,
  iamQueryListing,
  iamQueryListResult,
  iamQueryText,
} from "./sim-iam-query-operation-builders.js";

const versionMembers = ["VersionId", "IsDefaultVersion", "CreateDate"];

/**
 * The operations simulated IAM serves over the Query protocol that change a
 * Role after it is created, and the versions of a managed policy.
 */
export function simIamQueryUpdateOperations(): SimQueryOperations {
  return new Map([
    [
      "PutRolePermissionsBoundary",
      iamQueryAction(iamQueryText("RoleName", "PermissionsBoundary")),
    ],
    ["DeleteRolePermissionsBoundary", iamQueryAction(iamQueryText("RoleName"))],
    [
      "UpdateRole",
      iamQueryAction((fields) => ({
        ...iamQueryText("RoleName", "Description")(fields),
        MaxSessionDuration: fields.number("MaxSessionDuration"),
      })),
    ],
    [
      "UpdateAssumeRolePolicy",
      iamQueryAction(iamQueryText("RoleName", "PolicyDocument")),
    ],
    [
      "CreatePolicyVersion",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryText("PolicyArn", "PolicyDocument")(fields),
          SetAsDefault: fields.flag("SetAsDefault"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "PolicyVersion", versionMembers),
      },
    ],
    [
      "ListPolicyVersions",
      {
        input: iamQueryListing("PolicyArn"),
        result: iamQueryListResult("Versions", versionMembers),
      },
    ],
    [
      "DeletePolicyVersion",
      iamQueryAction(iamQueryText("PolicyArn", "VersionId")),
    ],
    [
      "SetDefaultPolicyVersion",
      iamQueryAction(iamQueryText("PolicyArn", "VersionId")),
    ],
  ]);
}
