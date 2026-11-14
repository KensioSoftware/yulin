import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";
import {
  iamQueryAction,
  iamQueryListing,
  iamQueryListResult,
  iamQueryText,
} from "./sim-iam-query-operation-builders.js";

const userMembers = ["Path", "UserName", "UserId", "Arn", "CreateDate"];
const groupMembers = ["Path", "GroupName", "GroupId", "Arn", "CreateDate"];

/**
 * The group operations simulated IAM serves over the Query protocol.
 */
export function simIamQueryGroupOperations(): SimQueryOperations {
  return new Map([
    [
      "PutGroupPolicy",
      iamQueryAction(iamQueryText("GroupName", "PolicyName", "PolicyDocument")),
    ],
    [
      "AttachGroupPolicy",
      iamQueryAction(iamQueryText("GroupName", "PolicyArn")),
    ],
    [
      "ListAttachedGroupPolicies",
      {
        input: iamQueryListing("GroupName", "PathPrefix"),
        result: iamQueryListResult("AttachedPolicies", [
          "PolicyName",
          "PolicyArn",
        ]),
      },
    ],
    [
      "CreateGroup",
      {
        input: iamQueryText("GroupName", "Path"),
        result: (output): string =>
          iamQueryEntity(output, "Group", groupMembers),
      },
    ],
    [
      "GetGroup",
      {
        input: iamQueryListing("GroupName"),
        result: (output): string =>
          iamQueryEntity(output, "Group", groupMembers) +
          iamQueryListResult("Users", userMembers)(output),
      },
    ],
    [
      "ListGroups",
      {
        input: iamQueryListing("PathPrefix"),
        result: iamQueryListResult("Groups", groupMembers),
      },
    ],
    [
      "ListGroupsForUser",
      {
        input: iamQueryListing("UserName"),
        result: iamQueryListResult("Groups", groupMembers),
      },
    ],
    ["DeleteGroup", iamQueryAction(iamQueryText("GroupName"))],
    ["AddUserToGroup", iamQueryAction(iamQueryText("GroupName", "UserName"))],
    [
      "RemoveUserFromGroup",
      iamQueryAction(iamQueryText("GroupName", "UserName")),
    ],
  ]);
}
