import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { simDynamoDbStreamRecordSize } from "./sim-dynamodb-stream-record-size.js";

/**
 * Three bytes, which base64 writes as the four characters `AQID`.
 */
const bytes = new Uint8Array([1, 2, 3]);

/**
 * The `SizeBytes` an image of these attributes counts for.
 */
function sizeOf(values: Record<string, SimDynamoDbAttributeValue>): number {
  return simDynamoDbStreamRecordSize([
    SimDynamoDbItem.fromAttributeValues(values),
  ]);
}

describe("DynamoDB stream record value sizes", () => {
  it("counts binary as the base64 a record carries it as", () => {
    // The name is one byte and the four base64 characters are one each,
    // rather than the three bytes the value holds.
    assertIdentical(sizeOf({ b: { B: bytes } }), 5);
  });

  it("counts a boolean and a null as the text they are written as", () => {
    // `true` is four characters and `false` is five, and a null is the `true`
    // its descriptor carries.
    assertIdentical(sizeOf({ on: { BOOL: true } }), 6);
    assertIdentical(sizeOf({ off: { BOOL: false } }), 8);
    assertIdentical(sizeOf({ nil: { NULL: true } }), 7);
  });

  it("counts a set as its members", () => {
    assertIdentical(sizeOf({ ss: { SS: ["a", "bb"] } }), 5);
    assertIdentical(sizeOf({ ns: { NS: ["1", "22"] } }), 5);
    assertIdentical(sizeOf({ bs: { BS: [bytes] } }), 6);
  });

  it("counts a list and a map with no overhead of their own", () => {
    // The 400 KB item rule adds three bytes for each of these. The stream rule
    // does not: a record is measured as the text it carries.
    assertIdentical(sizeOf({ l: { L: [{ S: "ab" }, { N: "12" }] } }), 5);
    assertIdentical(sizeOf({ m: { M: { k: { S: "v" } } } }), 3);
  });
});
