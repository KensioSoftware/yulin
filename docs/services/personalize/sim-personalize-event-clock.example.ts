/**
 * Timestamping an event from the simulated clock.
 */

import { PutEventsCommand } from "@aws-sdk/client-personalize-events";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const trackingId: string;

simAws.clock().freeze();
await simAws.clock().setTo(new Date("2026-03-04T10:00:00.000Z"));

await simAws.personalizeEvents().putEvents(
  new PutEventsCommand({
    trackingId,
    sessionId: "session-1",
    // The SDK types make sentAt a required property, so it is passed as
    // undefined rather than left off.
    eventList: [{ eventType: "view", itemId: "entry-1042", sentAt: undefined }],
  }),
);

// 2026-03-04T10:00:00.000Z
console.log(simAws.personalize().recordedEvents()[0]?.sentAt.toISOString());
