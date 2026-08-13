import {
  CreateEventBusCommand,
  type CreateEventBusCommandInput,
  DeleteEventBusCommand,
  ListEventBusesCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEventBridgeResourceAlreadyExistsException,
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

describe("EventBridge event bus validation", () => {
  it("refuses a second bus of the same name", async () => {
    // Given a created bus.
    const simAws = new SimAws();
    await simAws
      .eventBridge()
      .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

    // When the same name is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: "orders" }));
    });

    // Then it is refused rather than answered with the existing bus, unlike
    // an SNS CreateTopic.
    assertInstanceOf(error, SimEventBridgeResourceAlreadyExistsException);
  });

  it("refuses a custom bus named default", async () => {
    // Given a simulated EventBridge, whose default bus is always there.
    const simAws = new SimAws();

    // When a bus is created under that name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: "default" }));
    });

    // Then it is refused as a name already taken.
    assertInstanceOf(error, SimEventBridgeResourceAlreadyExistsException);
  });

  it("refuses deleting the default bus", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When its default bus is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .deleteEventBus(new DeleteEventBusCommand({ Name: "default" }));
    });

    // Then it is refused, as real EventBridge refuses it.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "Cannot delete event bus default.");
  });

  it("refuses a bus name real EventBridge would refuse", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a name with a disallowed character is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: "orders events" }));
    });

    // Then it is refused rather than created under a name AWS would not take.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "orders events");
  });

  it("refuses a partner event bus name", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a name carrying a partner separator is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().createEventBus(
        new CreateEventBusCommand({
          Name: "aws.partner/example.com/orders",
        }),
      );
    });

    // Then it is refused rather than created as an ordinary custom bus.
    assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    assertStringIncludes(error.message, "Partner event buses");
  });

  it("refuses bus inputs it does not model rather than dropping them", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a bus is asked for with each unmodelled property in turn.
    const inputs: CreateEventBusCommandInput[] = [
      { Name: "orders", Tags: [{ Key: "team", Value: "orders" }] },
      { Name: "orders", KmsKeyIdentifier: "alias/events" },
      {
        Name: "orders",
        DeadLetterConfig: {
          Arn: "arn:aws:sqs:us-east-1:888888888888:undelivered",
        },
      },
      { Name: "orders", LogConfig: { Level: "INFO" } },
      { Name: "orders", EventSourceName: "aws.partner/example.com/orders" },
    ];

    // Then each is refused, so nothing looks configured that is not.
    for (const input of inputs) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws
          .eventBridge()
          .createEventBus(new CreateEventBusCommand(input));
      });

      assertInstanceOf(error, SimEventBridgeUnsimulatedInputException);
    }
  });

  it("refuses a request that names no bus where one is required", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a bus is created and deleted with no name.
    const created = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: undefined }));
    });
    const deleted = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .deleteEventBus(new DeleteEventBusCommand({ Name: "" }));
    });

    // Then both are refused, unlike a describe, which defaults to the default
    // bus.
    assertInstanceOf(created, SimEventBridgeValidationException);
    assertStringIncludes(created.message, "Name is required");
    assertInstanceOf(deleted, SimEventBridgeValidationException);
  });

  it("refuses a description longer than real EventBridge takes", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a bus is created with a description over 512 characters.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().createEventBus(
        new CreateEventBusCommand({
          Name: "orders",
          Description: "x".repeat(513),
        }),
      );
    });

    // Then it is refused rather than stored and truncated later.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "512");
  });

  it("refuses a listing limit outside the range real EventBridge takes", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a listing asks for more than a page holds.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .listEventBuses(new ListEventBusesCommand({ Limit: 101 }));
    });

    // Then it is refused rather than answered with everything.
    assertInstanceOf(error, SimEventBridgeValidationException);
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a simulated EventBridge with one bus to list.
    const simAws = new SimAws();

    // When a listing carries a token from nowhere.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .listEventBuses(new ListEventBusesCommand({ NextToken: "3" }));
    });

    // Then it is refused rather than answered from an arbitrary offset.
    assertInstanceOf(error, SimEventBridgeValidationException);
  });
});
