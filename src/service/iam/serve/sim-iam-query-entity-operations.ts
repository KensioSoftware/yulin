import type {
  SimQueryOperation,
  SimQueryOperations,
} from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryMembers,
  queryScalarList,
} from "../../../serve/http/api/query/sim-query-result.js";
import { iamQueryListingResult } from "./sim-iam-query-listing.js";
import {
  iamQueryAction,
  iamQueryListing,
  iamQueryText,
} from "./sim-iam-query-operation-builders.js";

/**
 * The policy commands IAM serves alike for Roles, Users and groups, for the
 * kinds that serve each.
 */
function entityPolicyOperations(): SimQueryOperations {
  const operations = new Map<string, SimQueryOperation>();

  for (const kind of ["Role", "User", "Group"]) {
    const name = `${kind}Name`;

    operations.set(`Get${kind}Policy`, {
      input: iamQueryText(name, "PolicyName"),
      result: (output): string =>
        queryMembers(output, [name, "PolicyName", "PolicyDocument"]),
    });
    operations.set(`List${kind}Policies`, {
      input: iamQueryListing(name),
      result: (output): string =>
        queryScalarList(output, "PolicyNames") + iamQueryListingResult(output),
    });

    if (kind === "Role") {
      continue;
    }

    operations.set(
      `Delete${kind}Policy`,
      iamQueryAction(iamQueryText(name, "PolicyName")),
    );
    operations.set(
      `Detach${kind}Policy`,
      iamQueryAction(iamQueryText(name, "PolicyArn")),
    );
  }

  return operations;
}

/**
 * The policy operations simulated IAM serves over the Query protocol alike
 * for Roles, Users and groups, beyond those the Role operations serve.
 */
export function simIamQueryEntityOperations(): SimQueryOperations {
  return entityPolicyOperations();
}
