import { TestEventPatternCommand } from "@aws-sdk/client-eventbridge";
import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * One event to match patterns against, shaped like an event a bus receives.
 */
const orderEvent = {
  version: "0",
  id: "0f2c9d6e-0000-4000-8000-000000000000",
  "detail-type": "OrderPlaced",
  source: "orders.service",
  account: "888888888888",
  time: "2026-07-26T09:00:00Z",
  region: "us-east-1",
  resources: ["arn:aws:s3:::orders", "arn:aws:s3:::invoices"],
  tags: [],
  detail: {
    orderId: "order-1",
    total: 4200,
    currency: "GBP",
    customer: { name: "Alice", tier: "gold" },
    note: null,
    reference: "",
  },
};

/**
 * Whether a pattern matches the order event.
 */
async function matches(pattern: object): Promise<boolean> {
  const simAws = new SimAws();

  const output = await simAws.eventBridge().testEventPattern(
    new TestEventPatternCommand({
      EventPattern: JSON.stringify(pattern),
      Event: JSON.stringify(orderEvent),
    }),
  );

  return output.Result === true;
}

describe("EventBridge event pattern matching", () => {
  it("matches an exact value, and any of several", async () => {
    // Given patterns naming the event's source.
    // Then the value matching one of the listed values is enough.
    assertTrue(await matches({ source: ["orders.service"] }));
    assertTrue(
      await matches({ source: ["billing.service", "orders.service"] }),
    );
    assertFalse(await matches({ source: ["billing.service"] }));
  });

  it("requires every field of a pattern to match", async () => {
    // Given a pattern naming two fields, one of which is wrong.
    // Then the whole pattern fails, since fields are an "and".
    assertTrue(
      await matches({
        source: ["orders.service"],
        "detail-type": ["OrderPlaced"],
      }),
    );
    assertFalse(
      await matches({
        source: ["orders.service"],
        "detail-type": ["OrderCancelled"],
      }),
    );
  });

  it("matches nested fields of the detail", async () => {
    // Given a pattern reaching into the detail and into an object inside it.
    assertTrue(await matches({ detail: { orderId: ["order-1"] } }));
    assertTrue(await matches({ detail: { customer: { tier: ["gold"] } } }));
    assertFalse(await matches({ detail: { customer: { tier: ["silver"] } } }));
  });

  it("matches a field the event carries a list for when the lists overlap", async () => {
    // Given patterns naming one of the event's resources, and one it has not.
    assertTrue(await matches({ resources: ["arn:aws:s3:::invoices"] }));
    assertFalse(await matches({ resources: ["arn:aws:s3:::nothing"] }));
  });

  it("compares values by type, so a string does not match a number", async () => {
    // Given the total, which the event carries as a number.
    assertTrue(await matches({ detail: { total: [4200] } }));
    assertFalse(await matches({ detail: { total: ["4200"] } }));
  });

  it("matches null and the empty string as values", async () => {
    // Given fields the event carries as null and as an empty string.
    assertTrue(await matches({ detail: { note: [null] } }));
    assertTrue(await matches({ detail: { reference: [""] } }));
    assertFalse(await matches({ detail: { note: [""] } }));
  });

  it("matches a prefix and a suffix of a string", async () => {
    assertTrue(await matches({ time: [{ prefix: "2026-07-26" }] }));
    assertFalse(await matches({ time: [{ prefix: "2025" }] }));
    assertTrue(await matches({ source: [{ suffix: ".service" }] }));
    assertFalse(await matches({ source: [{ suffix: ".team" }] }));

    // And neither matches a value that is not a string.
    assertFalse(await matches({ detail: { total: [{ prefix: "42" }] } }));
  });

  it("matches anything but the values named", async () => {
    assertTrue(
      await matches({ detail: { currency: [{ "anything-but": "USD" }] } }),
    );
    assertFalse(
      await matches({ detail: { currency: [{ "anything-but": "GBP" }] } }),
    );
    assertTrue(
      await matches({
        detail: { currency: [{ "anything-but": ["USD", "EUR"] }] },
      }),
    );
    assertFalse(
      await matches({
        detail: { currency: [{ "anything-but": ["USD", "GBP"] }] },
      }),
    );
  });

  it("compares numbers, including a range", async () => {
    assertTrue(
      await matches({ detail: { total: [{ numeric: ["=", 4200] }] } }),
    );
    assertTrue(
      await matches({ detail: { total: [{ numeric: [">", 1000] }] } }),
    );
    assertFalse(
      await matches({ detail: { total: [{ numeric: ["<", 1000] }] } }),
    );
    assertTrue(
      await matches({
        detail: { total: [{ numeric: [">", 1000, "<=", 5000] }] },
      }),
    );
    assertFalse(
      await matches({
        detail: { total: [{ numeric: [">", 1000, "<=", 4000] }] },
      }),
    );
  });

  it("compares with every comparator a numeric condition takes", async () => {
    assertTrue(
      await matches({ detail: { total: [{ numeric: [">=", 4200] }] } }),
    );
    assertTrue(
      await matches({ detail: { total: [{ numeric: ["<=", 4200] }] } }),
    );
    assertFalse(
      await matches({ detail: { total: [{ numeric: [">=", 4201] }] } }),
    );
    assertFalse(
      await matches({ detail: { total: [{ numeric: ["<=", 4199] }] } }),
    );

    // And a numeric condition matches no string, whatever it holds.
    assertFalse(
      await matches({ detail: { currency: [{ numeric: ["=", 4200] }] } }),
    );
  });

  it("matches on a field being there or not being there", async () => {
    assertTrue(await matches({ detail: { orderId: [{ exists: true }] } }));
    assertFalse(await matches({ detail: { orderId: [{ exists: false }] } }));
    assertTrue(await matches({ detail: { refundId: [{ exists: false }] } }));
    assertFalse(await matches({ detail: { refundId: [{ exists: true }] } }));
  });

  it("matches a field the event carries an empty list for as being there", async () => {
    // Given a field the event carries as an empty list.
    // Then it exists, because exists is about the field rather than its
    // members, and no value matches inside it.
    assertTrue(await matches({ tags: [{ exists: true }] }));
    assertFalse(await matches({ tags: [{ exists: false }] }));
    assertFalse(await matches({ tags: ["release"] }));
  });

  it("compares numbers after parsing, so equivalent forms are one value", async () => {
    // Given the total, written three ways that JSON parses the same.
    // Then all three match, which is a divergence recorded in the docs: real
    // EventBridge compares the JSON token for an exact match.
    assertTrue(await matches({ detail: { total: [4200] } }));
    assertTrue(await matches({ detail: { total: [4200] } }));
    assertTrue(await matches({ detail: { total: [4.2e3] } }));
  });

  it("does not match a field the event does not have", async () => {
    // Given a pattern for a field that is absent, with a condition that is
    // about a value rather than about presence.
    assertFalse(await matches({ detail: { refundId: ["refund-1"] } }));
    assertFalse(
      await matches({ detail: { refundId: [{ "anything-but": "refund-1" }] } }),
    );
  });

  it("does not match a nested pattern against a value that is not an object", async () => {
    // Given a pattern treating a string field as an object.
    assertFalse(await matches({ source: { nested: ["orders.service"] } }));
  });

  it("takes any of several conditions on one field", async () => {
    // Given a field written with two conditions, either of which is enough.
    assertTrue(
      await matches({
        detail: { currency: [{ prefix: "US" }, { suffix: "BP" }] },
      }),
    );
    assertFalse(
      await matches({
        detail: { currency: [{ prefix: "US" }, { suffix: "UR" }] },
      }),
    );
  });
});
