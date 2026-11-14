import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryList,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";
import {
  iamQueryListingInput,
  iamQueryListingResult,
} from "./sim-iam-query-listing.js";
import {
  iamQueryBoundaryAndTags,
  iamQueryTagsInput,
} from "./sim-iam-query-tag-operations.js";

/**
 * The members IAM describes one Role with.
 */
const roleMembers = [
  "Path",
  "RoleName",
  "RoleId",
  "Arn",
  "CreateDate",
  "AssumeRolePolicyDocument",
  "Description",
  "MaxSessionDuration",
];

/**
 * The Role operations simulated IAM serves over the Query protocol.
 *
 * The policy operations that name a Role are here rather than with the managed
 * policies, because an inline policy belongs to the Role it is written on and
 * has no life of its own.
 */
export function simIamQueryRoleOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateRole",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
          Path: fields.text("Path"),
          AssumeRolePolicyDocument: fields.text("AssumeRolePolicyDocument"),
          Description: fields.text("Description"),
          MaxSessionDuration: fields.number("MaxSessionDuration"),
          PermissionsBoundary: fields.text("PermissionsBoundary"),
          Tags: iamQueryTagsInput(fields),
        }),
        result: (output): string =>
          iamQueryEntity(output, "Role", roleMembers, iamQueryBoundaryAndTags),
      },
    ],
    [
      "GetRole",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "Role", roleMembers, iamQueryBoundaryAndTags),
      },
    ],
    [
      "ListRoles",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryListingInput(fields),
          PathPrefix: fields.text("PathPrefix"),
        }),
        result: (output): string =>
          queryList(output, "Roles", (role) =>
            queryMembers(role, roleMembers),
          ) + iamQueryListingResult(output),
      },
    ],
    [
      "DeleteRole",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
        }),
        result: (): string => "",
      },
    ],
    [
      "AttachRolePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
          PolicyArn: fields.text("PolicyArn"),
        }),
        result: (): string => "",
      },
    ],
    [
      "ListAttachedRolePolicies",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryListingInput(fields),
          RoleName: fields.text("RoleName"),
          PathPrefix: fields.text("PathPrefix"),
        }),
        result: (output): string =>
          queryList(output, "AttachedPolicies", (policy) =>
            queryMembers(policy, ["PolicyName", "PolicyArn"]),
          ) + iamQueryListingResult(output),
      },
    ],
    [
      "DetachRolePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
          PolicyArn: fields.text("PolicyArn"),
        }),
        result: (): string => "",
      },
    ],
    [
      "PutRolePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
          PolicyName: fields.text("PolicyName"),
          PolicyDocument: fields.text("PolicyDocument"),
        }),
        result: (): string => "",
      },
    ],
    [
      "DeleteRolePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          RoleName: fields.text("RoleName"),
          PolicyName: fields.text("PolicyName"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}
