import {
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
} from "@aws-sdk/client-personalize";
import { PutEventsCommand } from "@aws-sdk/client-personalize-events";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

async function givenAnEventTracker(simAws: SimAws): Promise<string> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));
  const tracker = await simAws.personalize().createEventTracker(
    new CreateEventTrackerCommand({
      name: "catalogue-events",
      datasetGroupArn: group.datasetGroupArn,
    }),
  );

  assertNonNullable(tracker.trackingId);

  return tracker.trackingId;
}

describe("Personalize PutEvents", () => {
  it("records what the request carried", async () => {
    // Given an event tracker on a dataset group.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When a visitor views an entry.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        userId: "visitor-7",
        sessionId: "session-1",
        eventList: [
          {
            eventType: "view",
            itemId: "entry-1042",
            sentAt: new Date("2026-03-04T10:00:00.000Z"),
          },
        ],
      }),
    );

    // Then the interaction is there with the user, the item and the tracker.
    const [event] = simAws.personalize().recordedEvents();
    assertNonNullable(event);
    assertIdentical(event.eventType, "view");
    assertIdentical(event.itemId, "entry-1042");
    assertIdentical(event.userId, "visitor-7");
    assertIdentical(event.sessionId, "session-1");
    assertIdentical(event.trackingId, trackingId);
    assertIdentical(event.sentAt.toISOString(), "2026-03-04T10:00:00.000Z");
  });

  it("records the properties an event carries as a JSON string", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When an event carries data of its own.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        sessionId: "session-1",
        eventList: [
          {
            eventType: "rate",
            itemId: "entry-1042",
            eventValue: 4,
            properties: { numberOfRatings: 12 },
            sentAt: new Date(),
          },
        ],
      }),
    );

    // Then the properties are held as the string the wire would carry.
    const [event] = simAws.personalize().recordedEvents();
    assertNonNullable(event);
    assertIdentical(event.properties, '{"numberOfRatings":12}');
    assertIdentical(event.eventValue, 4);
  });

  it("stamps an event with the simulated clock where it omits sentAt", async () => {
    // Given a simulated AWS with time standing still.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);
    simAws.clock().freeze();
    await simAws.clock().setTo(new Date("2026-03-04T10:00:00.000Z"));

    // When an event arrives, time moves on, and a second one arrives.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        sessionId: "session-1",
        eventList: [
          { eventType: "view", itemId: "entry-1", sentAt: undefined },
        ],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 20 });
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        sessionId: "session-1",
        eventList: [
          { eventType: "view", itemId: "entry-2", sentAt: undefined },
        ],
      }),
    );

    // Then each one records the instant it arrived at.
    assertArrayEquals(
      simAws
        .personalize()
        .recordedEvents()
        .map((event) => event.sentAt.toISOString()),
      ["2026-03-04T10:00:00.000Z", "2026-03-04T10:20:00.000Z"],
    );
  });

  it("records a batch in the order the request listed it", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When one request carries a session's worth of interactions.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        sessionId: "session-1",
        eventList: [
          { eventType: "view", itemId: "entry-1", sentAt: new Date() },
          { eventType: "view", itemId: "entry-2", sentAt: new Date() },
          { eventType: "purchase", itemId: "entry-2", sentAt: new Date() },
        ],
      }),
    );

    // Then they are recorded in that order.
    assertArrayEquals(
      simAws
        .personalize()
        .recordedEvents()
        .map((event) => `${event.eventType}:${event.itemId ?? ""}`),
      ["view:entry-1", "view:entry-2", "purchase:entry-2"],
    );
  });

  it("records an anonymous session with no user", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When a visitor who has not signed in views an entry.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId,
        sessionId: "session-1",
        eventList: [
          { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
        ],
      }),
    );

    // Then the interaction is recorded against the session alone.
    const [event] = simAws.personalize().recordedEvents();
    assertNonNullable(event);
    assertUndefined(event.userId);
    assertIdentical(event.sessionId, "session-1");
  });

  it("refuses a tracking ID no tracker holds", async () => {
    // Given an event tracker, and a tracking ID that is not its own.
    const simAws = new SimAws();
    await givenAnEventTracker(simAws);

    // When an event names the wrong tracking ID.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId: "0e5c47d8-0000-0000-0000-000000000000",
            sessionId: "session-1",
            eventList: [
              { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
            ],
          }),
        ),
    );

    // Then Personalize reports the tracker as missing, and records nothing.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertArrayLength(simAws.personalize().recordedEvents(), 0);
  });

  it("refuses more events than one request may carry", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When a request batches eleven interactions.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId,
            sessionId: "session-1",
            eventList: Array.from({ length: 11 }, (_, index) => ({
              eventType: "view",
              itemId: `entry-${String(index)}`,
              sentAt: new Date(),
            })),
          }),
        ),
    );

    // Then it is refused, as real Personalize refuses it at ten.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "up to 10");
  });

  it("refuses a metric attribution it has nothing to attribute to", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When an event names a metric attribution source.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId,
            sessionId: "session-1",
            eventList: [
              {
                eventType: "view",
                itemId: "entry-1042",
                sentAt: new Date(),
                metricAttribution: { eventAttributionSource: "storefront" },
              },
            ],
          }),
        ),
    );

    // Then it is refused by name rather than dropped.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "metricAttribution is not simulated");
  });

  it("requires a session and an event type", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const trackingId = await givenAnEventTracker(simAws);

    // When a request leaves the session out.
    const sessionless = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId,
            sessionId: undefined,
            eventList: [{ eventType: "view", sentAt: new Date() }],
          }),
        ),
    );

    // And when an event leaves its type out.
    const typeless = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId,
            sessionId: "session-1",
            eventList: [{ eventType: undefined, sentAt: new Date() }],
          }),
        ),
    );

    // Then both are refused as invalid input.
    assertIdentical(sessionless.name, "InvalidInputException");
    assertIdentical(typeless.name, "InvalidInputException");
  });
});
