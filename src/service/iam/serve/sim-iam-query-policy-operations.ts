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

/**
 * The members IAM describes one managed policy with.
 */
const policyMembers = [
  "PolicyName",
  "PolicyId",
  "Arn",
  "Path",
  "DefaultVersionId",
  "AttachmentCount",
  "PermissionsBoundaryUsageCount",
  "IsAttachable",
  "Description",
  "CreateDate",
  "UpdateDate",
];

/**
 * The managed policy operations simulated IAM serves over the Query protocol.
 */
export function simIamQueryPolicyOperations(): SimQueryOperations {
  return new Map([
    [
      "CreatePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          PolicyName: fields.text("PolicyName"),
          Path: fields.text("Path"),
          PolicyDocument: fields.text("PolicyDocument"),
          Description: fields.text("Description"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "Policy", policyMembers),
      },
    ],
    [
      "GetPolicy",
      {
        input: (fields): Record<string, unknown> => ({
          PolicyArn: fields.text("PolicyArn"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "Policy", policyMembers),
      },
    ],
    [
      "ListPolicies",
      {
        input: (fields): Record<string, unknown> => ({
          ...iamQueryListingInput(fields),
          Scope: fields.text("Scope"),
          OnlyAttached: fields.flag("OnlyAttached"),
          PathPrefix: fields.text("PathPrefix"),
          PolicyUsageFilter: fields.text("PolicyUsageFilter"),
        }),
        result: (output): string =>
          queryList(output, "Policies", (policy) =>
            queryMembers(policy, policyMembers),
          ) + iamQueryListingResult(output),
      },
    ],
    [
      "DeletePolicy",
      {
        input: (fields): Record<string, unknown> => ({
          PolicyArn: fields.text("PolicyArn"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}
