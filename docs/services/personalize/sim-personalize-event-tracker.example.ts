/**
 * Recording an item interaction through an event tracker.
 */

import {
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
} from "@aws-sdk/client-personalize";
import { PutEventsCommand } from "@aws-sdk/client-personalize-events";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const tracker = await simAws.personalize().createEventTracker(
  new CreateEventTrackerCommand({
    name: "catalogue-events",
    datasetGroupArn: group.datasetGroupArn,
  }),
);

await simAws.personalizeEvents().putEvents(
  new PutEventsCommand({
    trackingId: tracker.trackingId,
    userId: "visitor-7",
    sessionId: "session-1",
    eventList: [
      { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
    ],
  }),
);

const [event] = simAws.personalize().recordedEvents();

// view entry-1042 visitor-7
console.log(event?.eventType, event?.itemId, event?.userId);
