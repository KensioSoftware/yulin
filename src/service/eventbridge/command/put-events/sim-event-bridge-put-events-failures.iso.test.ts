import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

/**
 * An entry with everything a routable event needs, so a request under test
 * carries at least one and is not refused outright.
 */
function routableEntry(): Record<string, string> {
  return {
    Source: "orders.service",
    DetailType: "OrderPlaced",
    Detail: "{}",
  };
}

describe("EventBridge PutEvents failures", () => {
  it("fails the entry whose Detail is not a JSON object, and keeps the rest", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When one entry of three carries a malformed detail.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          routableEntry(),
          { ...routableEntry(), Detail: "not json at all" },
          routableEntry(),
        ],
      }),
    );

    // Then only that entry failed, in its own place in the result.
    const results = output.Entries;

    assertNonNullable(results);

    const failed = results[1];

    assertNonNullable(failed);
    assertIdentical(output.FailedEntryCount, 1);
    assertNonNullable(results[0]?.EventId);
    assertIdentical(failed.ErrorCode, "MalformedDetail");
    assertIdentical(failed.ErrorMessage, "Detail is malformed.");
    assertUndefined(failed.EventId);
    assertNonNullable(results[2]?.EventId);

    // And the bus took the two that were usable.
    assertArrayLength(simAws.eventBridge().eventsOn("default"), 2);
  });

  it("fails an entry whose Detail is valid JSON but not an object", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When an entry's detail is a JSON array rather than an object.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [routableEntry(), { ...routableEntry(), Detail: "[1, 2, 3]" }],
      }),
    );

    // Then it is malformed, since an event pattern has no fields to match on.
    assertIdentical(output.Entries?.[1]?.ErrorCode, "MalformedDetail");
  });

  it("fails an entry missing a field an event needs to be routed", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When entries leave out each required field in turn.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          routableEntry(),
          { DetailType: "OrderPlaced", Detail: "{}" },
          { Source: "orders.service", Detail: "{}" },
          { Source: "orders.service", DetailType: "OrderPlaced" },
        ],
      }),
    );

    // Then each fails on its own, naming the field it is missing.
    assertIdentical(output.FailedEntryCount, 3);
    assertStringIncludes(output.Entries?.[1]?.ErrorMessage ?? "", "Source");
    assertStringIncludes(output.Entries?.[2]?.ErrorMessage ?? "", "DetailType");
    assertStringIncludes(output.Entries?.[3]?.ErrorMessage ?? "", "Detail");
  });

  it("fails an entry whose DetailType is longer than EventBridge takes", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When an entry's detail type runs past 128 characters.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          routableEntry(),
          { ...routableEntry(), DetailType: "O".repeat(129) },
        ],
      }),
    );

    // Then that entry fails, naming the limit and the length it came to.
    assertIdentical(output.FailedEntryCount, 1);
    assertStringIncludes(output.Entries?.[1]?.ErrorMessage ?? "", "128");
    assertStringIncludes(output.Entries?.[1]?.ErrorMessage ?? "", "129");
  });

  it("refuses a request carrying no Entries at all", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a request leaves the entries out rather than sending an empty list.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .putEvents(new PutEventsCommand({ Entries: undefined }));
    });

    // Then it is refused the same way an empty list is.
    assertInstanceOf(error, SimEventBridgeValidationException);
  });

  it("refuses an entry naming something that is not an event bus ARN", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When an entry names an ARN of another kind.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              ...routableEntry(),
              EventBusName: "arn:aws:sns:us-east-1:888888888888:orders",
            },
          ],
        }),
      );
    });

    // Then it is refused rather than read as a bus name.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "is not an event bus ARN");
  });

  it("refuses the whole request when no entry could be routed", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When every entry is missing something.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [{ Source: "orders.service" }, { Detail: "{}" }],
        }),
      );
    });

    // Then the request fails outright rather than entry by entry, which is
    // the rule real EventBridge documents.
    assertInstanceOf(error, SimEventBridgeValidationException);
  });

  it("refuses a request carrying no entries or more than ten", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a request carries nothing.
    const empty = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .putEvents(new PutEventsCommand({ Entries: [] }));
    });

    // And when it carries one entry too many.
    const tooMany = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: Array.from({ length: 11 }, routableEntry),
        }),
      );
    });

    // Then both are refused.
    assertInstanceOf(empty, SimEventBridgeValidationException);
    assertInstanceOf(tooMany, SimEventBridgeValidationException);
  });

  it("refuses a request over the one megabyte limit", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When two entries together come to more than a megabyte.
    const half = JSON.stringify({ padding: "x".repeat(600_000) });
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            { ...routableEntry(), Detail: half },
            { ...routableEntry(), Detail: half },
          ],
        }),
      );
    });

    // Then the request is refused, since the limit is on the whole of it.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "1048576");
  });

  it("refuses an entry naming another Account's event bus", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When an entry names a bus ARN in another Account.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              ...routableEntry(),
              EventBusName:
                "arn:aws:events:us-east-1:999999999999:event-bus/orders",
            },
          ],
        }),
      );
    });

    // Then it is refused rather than quietly put on a local bus of that name.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "another Account's event bus");
  });

  it("refuses a global endpoint rather than ignoring it", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a request names a global endpoint.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [routableEntry()],
          EndpointId: "abcde.veo",
        }),
      );
    });

    // Then it is refused, so nothing looks routed that was not.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
  });
});
