import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type { SimDynamoDbTagInput } from "../table/table.types.js";

interface SimDynamoDbTagResourceReach {
  readonly access: SimDynamoDbTableAccess;
  readonly action: string;
  readonly resourceArn: string | undefined;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * Find the resource a tag command names, refusing the caller before looking it
 * up.
 *
 * A table is the only taggable DynamoDB resource this simulation has. Backups
 * and global table replicas are not simulated, so an ARN naming one of those is
 * an ARN naming nothing.
 */
export function reachSimDynamoDbTagResource(
  reach: SimDynamoDbTagResourceReach,
): SimDynamoDbTable {
  const arn = readResourceArn(reach.resourceArn, reach.action);

  return reach.access.requiredByName(
    reach.action,
    reach.access.reference(arn),
    reach.caller,
  );
}

/**
 * Read the ARN a tag command names its resource by.
 *
 * The tag commands take an ARN where the table commands take a name or an ARN.
 * A bare table name is refused rather than resolved, since a caller passing one
 * to real DynamoDB would be refused too, and finding the table anyway would let
 * a test pass on a request AWS rejects.
 */
function readResourceArn(
  resourceArn: string | undefined,
  action: string,
): string {
  const arn = resourceArn ?? "";

  if (!arn.startsWith("arn:")) {
    throw new SimDynamoDbValidationException(
      `${action.replace("dynamodb:", "")} requires a ResourceArn naming the ` +
        `resource to work on, as an ARN rather than a name`,
    );
  }

  return arn;
}

/**
 * Read the tags a TagResource request carries.
 *
 * `Tags` is a required parameter, so a request without one is refused rather
 * than taken as a call that changes nothing.
 */
export function readSimDynamoDbTags(
  tags: readonly SimDynamoDbTagInput[] | undefined,
): readonly SimDynamoDbTagInput[] {
  if (tags === undefined) {
    throw new SimDynamoDbValidationException(
      "TagResource requires Tags naming what to tag the resource with",
    );
  }

  return tags;
}

/**
 * Read the keys an UntagResource request names.
 *
 * `TagKeys` is a required parameter, as `Tags` is on the way in.
 */
export function readSimDynamoDbTagKeys(
  tagKeys: readonly string[] | undefined,
): readonly string[] {
  if (tagKeys === undefined) {
    throw new SimDynamoDbValidationException(
      "UntagResource requires TagKeys naming what to take off the resource",
    );
  }

  return tagKeys;
}
