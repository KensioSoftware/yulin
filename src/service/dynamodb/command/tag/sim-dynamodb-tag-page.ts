import type { SimDynamoDbTableTag } from "../../table/sim-dynamodb-table-tag.js";
import { compareSimDynamoDbTextBytes } from "../../table/sim-dynamodb-table-order.js";

/**
 * How many tags one page of ListTagsOfResource carries.
 *
 * The API has no page size parameter, so this is the simulator's choice rather
 * than DynamoDB's. It is half of the 50 tags a resource holds, so a resource
 * tagged the way most are lists in one page, and a test that wants to see a
 * NextToken can reach one without inventing hundreds of tags.
 */
const pageSize = 25;

/**
 * One page of tags, as ListTagsOfResource hands them out.
 *
 * The token is the key the next page resumes after rather than an opaque
 * cursor, which is what makes a token still work when the tag it names has
 * since been removed. It follows the ListTables token in that.
 */
export class SimDynamoDbTagPage {
  public readonly tags: readonly SimDynamoDbTableTag[];
  public readonly nextToken: string | undefined;

  constructor(tags: readonly SimDynamoDbTableTag[], nextToken?: string) {
    const remaining = after(tags, nextToken);

    this.tags = remaining.slice(0, pageSize);
    this.nextToken = tokenFor(remaining, this.tags);
  }
}

/**
 * The tags left to list after the key a request resumes from.
 */
function after(
  tags: readonly SimDynamoDbTableTag[],
  nextToken: string | undefined,
): readonly SimDynamoDbTableTag[] {
  if (nextToken === undefined) {
    return tags;
  }

  return tags.filter(
    (tag) => compareSimDynamoDbTextBytes(tag.key, nextToken) > 0,
  );
}

/**
 * The token to resume from, when there is anything left to resume for.
 *
 * A token on the last page would send a caller looping until it got an empty
 * page, so DynamoDB leaves it off and so does this.
 */
function tokenFor(
  remaining: readonly SimDynamoDbTableTag[],
  page: readonly SimDynamoDbTableTag[],
): string | undefined {
  const last = page.at(-1);

  if (last === undefined || page.length === remaining.length) {
    return undefined;
  }

  return last.key;
}
