import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMap,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";
import {
  iamQueryAction,
  iamQueryListing,
  iamQueryText,
} from "./sim-iam-query-operation-builders.js";
import { iamQueryListingResult } from "./sim-iam-query-listing.js";
import { iamQueryRoleMembers } from "./sim-iam-query-role-operations.js";
import {
  iamQueryTags,
  iamQueryTagsInput,
} from "./sim-iam-query-tag-operations.js";

const profileMembers = [
  "Path",
  "InstanceProfileName",
  "InstanceProfileId",
  "Arn",
  "CreateDate",
];

/**
 * Write an instance profile's members, with the Roles and tags it holds.
 */
function profile(output: SimQueryOutput): string {
  return (
    queryMembers(output, profileMembers) +
    queryList(output, "Roles", (role) =>
      queryMembers(role, iamQueryRoleMembers),
    ) +
    iamQueryTags(output)
  );
}

const oneProfile = (output: SimQueryOutput): string =>
  iamQueryEntity(output, "InstanceProfile", [], profile);

const profileList = (output: SimQueryOutput): string =>
  queryList(output, "InstanceProfiles", profile) +
  iamQueryListingResult(output);

/**
 * The instance profile, rename and Account summary operations simulated IAM
 * serves over the Query protocol.
 */
export function simIamQueryProfileOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateInstanceProfile",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryText("InstanceProfileName", "Path")(fields),
          Tags: iamQueryTagsInput(fields),
        }),
        result: oneProfile,
      },
    ],
    [
      "GetInstanceProfile",
      { input: iamQueryText("InstanceProfileName"), result: oneProfile },
    ],
    [
      "ListInstanceProfiles",
      { input: iamQueryListing("PathPrefix"), result: profileList },
    ],
    [
      "ListInstanceProfilesForRole",
      { input: iamQueryListing("RoleName"), result: profileList },
    ],
    [
      "DeleteInstanceProfile",
      iamQueryAction(iamQueryText("InstanceProfileName")),
    ],
    [
      "AddRoleToInstanceProfile",
      iamQueryAction(iamQueryText("InstanceProfileName", "RoleName")),
    ],
    [
      "RemoveRoleFromInstanceProfile",
      iamQueryAction(iamQueryText("InstanceProfileName", "RoleName")),
    ],
    [
      "UpdateUser",
      iamQueryAction(iamQueryText("UserName", "NewUserName", "NewPath")),
    ],
    [
      "UpdateGroup",
      iamQueryAction(iamQueryText("GroupName", "NewGroupName", "NewPath")),
    ],
    [
      "GetAccountSummary",
      {
        input: (): Record<string, unknown> => ({}),
        result: (output): string => queryMap(output, "SummaryMap"),
      },
    ],
  ]);
}
