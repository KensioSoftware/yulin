import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";

/**
 * How long after its TTL timestamp an expired item is deleted.
 *
 * Real DynamoDB does not delete on the timestamp. It marks the item expired and
 * typically deletes it within 48 hours, and reads keep returning it until then,
 * which is why the AWS docs tell you to filter expired items on read rather
 * than trust they have gone.
 *
 * AWS promises a window rather than an instant, so a simulation has to pick a
 * point in it. This picks the far end, because that is the longest an expired
 * item can still be readable and so is the behaviour an application has to cope
 * with. A test can rely on an item surviving its TTL timestamp, and on it being
 * gone once the window has passed. It should not rely on one still being there
 * partway through the window: real DynamoDB may well have collected it by then.
 */
const deletionWindowMilliseconds = 48 * 60 * 60 * 1000;

/**
 * How far back a TTL timestamp can be and still be acted on.
 *
 * Real DynamoDB leaves an item alone when its timestamp is more than five years
 * in the past. The rule guards against a malformed value: epoch milliseconds
 * written where epoch seconds belong lands far in the future, and the reverse
 * mistake lands far in the past, and neither is what the application meant.
 *
 * Five calendar years vary in length, so this is 1825 days.
 */
const eligibilityWindowMilliseconds = 5 * 365 * 24 * 60 * 60 * 1000;

/**
 * The furthest instant a JavaScript Date reaches.
 */
const greatestInstantMilliseconds = 8_640_000_000_000_000;

/**
 * When an item's TTL attribute says it should be deleted, if it says so at all.
 *
 * The attribute holds epoch seconds in a Number. An item without the attribute,
 * or holding a String or anything else, never expires, and that is not an
 * error: real DynamoDB skips it rather than refusing it. A number too large to
 * stand for an instant is skipped the same way, and so is one more than five
 * years before `at`.
 */
export function simDynamoDbItemDeletionInstant(
  item: SimDynamoDbItem,
  attributeName: string,
  at: Date,
): Date | undefined {
  const value = item.attribute(attributeName);

  if (value?.kind !== "N") {
    return undefined;
  }

  // Always a finite number: DynamoDB refuses anything outside its own range on
  // the way in, which is far inside what a JavaScript number holds.
  const seconds = Number(value.number.text);
  const expiry = seconds * 1000;

  if (at.getTime() - expiry > eligibilityWindowMilliseconds) {
    return undefined;
  }

  const instant = expiry + deletionWindowMilliseconds;

  if (Math.abs(instant) > greatestInstantMilliseconds) {
    return undefined;
  }

  return new Date(instant);
}
