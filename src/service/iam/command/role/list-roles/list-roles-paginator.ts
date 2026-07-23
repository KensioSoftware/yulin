import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { SimIamInvalidMarkerException } from "../../../error/sim-iam.error.js";

/**
 * One page of ListRoles results, carrying the sliced roles plus the
 * truncation/marker state the SDK output needs.
 */
export interface ListRolesPage {
  readonly roles: readonly SimIamRole[];
  readonly isTruncated: boolean;
  readonly marker: string | undefined;
}

/**
 * Marker-based pagination for ListRoles.
 *
 * AWS paginates ListRoles with an opaque `Marker` token and a `MaxItems`
 * page size. This class owns that whole concern: validating MaxItems,
 * decoding the incoming marker back to the role it points at, finding the
 * resume position, slicing the page, and encoding the next marker when the
 * result is truncated.
 *
 * Pulling it out of the handler keeps the handler focused on filtering roles
 * and shaping the SDK output, and keeps the marker encoding (a base64url of
 * the role name) in a single place.
 */
export class ListRolesPaginator {
  /**
   * Slice `roles` (already filtered and sorted by the caller) into a single
   * page, resolving the resume point from `markerInput` and bounding the page
   * size by `maxItemsInput`.
   */
  page(
    roles: readonly SimIamRole[],
    maxItemsInput: number | undefined,
    markerInput: string | undefined,
  ): ListRolesPage {
    const maxItems = this.getMaxItems(maxItemsInput);

    const startRoleName =
      markerInput === undefined ? undefined : this.parseMarker(markerInput);

    const startIndex = this.getStartIndex(roles, startRoleName);

    const page = roles.slice(startIndex, startIndex + maxItems);
    const lastRole = page.at(-1);
    const isTruncated = startIndex + page.length < roles.length;

    return {
      roles: page,
      isTruncated,
      marker:
        isTruncated && lastRole !== undefined
          ? this.makeMarker(lastRole.roleName)
          : undefined,
    };
  }

  private getMaxItems(maxItems = 100): number {
    if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 1000) {
      throw new RangeError(
        "ListRolesCommand.input.MaxItems must be an integer between 1 and 1000",
      );
    }

    return maxItems;
  }

  private getStartIndex(
    roles: readonly SimIamRole[],
    startRoleName: SimIamRoleName | undefined,
  ): number {
    if (startRoleName === undefined) {
      return 0;
    }

    const markerIndex = roles.findIndex(
      (role) => role.roleName === startRoleName,
    );

    if (markerIndex === -1) {
      throw new SimIamInvalidMarkerException(
        "ListRolesCommand.input.Marker is invalid",
      );
    }

    return markerIndex + 1;
  }

  private makeMarker(roleName: SimIamRoleName): string {
    return Buffer.from(roleName, "utf8").toString("base64url");
  }

  private parseMarker(marker: string): SimIamRoleName {
    return Buffer.from(marker, "base64url").toString("utf8") as SimIamRoleName;
  }
}
