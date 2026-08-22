import {
  CreateDatasetCommand,
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
  CreateSchemaCommand,
  DescribeEventTrackerCommand,
  PersonalizeClient,
} from "@aws-sdk/client-personalize";
import {
  PersonalizeEventsClient,
  PutEventsCommand,
  PutItemsCommand,
  PutUsersCommand,
} from "@aws-sdk/client-personalize-events";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Personalize Events SDK interception", () => {
  it("records what an intercepted PersonalizeEventsClient sends", async () => {
    // Given an intercepted Personalize client and events client.
    const simSdk = new SimSdk();
    simSdk.intercept(PersonalizeClient);
    simSdk.intercept(PersonalizeEventsClient);

    const client = new PersonalizeClient({ region: "eu-west-2" });
    const events = new PersonalizeEventsClient({ region: "eu-west-2" });

    try {
      // And an event tracker with an Items and a Users dataset beside it.
      const group = await client.send(
        new CreateDatasetGroupCommand({ name: "catalogue" }),
      );
      const schema = await client.send(
        new CreateSchemaCommand({
          name: "catalogue-schema",
          schema: JSON.stringify({ type: "record", name: "Items", fields: [] }),
        }),
      );
      const items = await client.send(
        new CreateDatasetCommand({
          name: "items",
          datasetGroupArn: group.datasetGroupArn,
          schemaArn: schema.schemaArn,
          datasetType: "ITEMS",
        }),
      );
      const users = await client.send(
        new CreateDatasetCommand({
          name: "users",
          datasetGroupArn: group.datasetGroupArn,
          schemaArn: schema.schemaArn,
          datasetType: "USERS",
        }),
      );
      const tracker = await client.send(
        new CreateEventTrackerCommand({
          name: "catalogue-events",
          datasetGroupArn: group.datasetGroupArn,
        }),
      );

      // When ordinary SDK code sends all three events operations.
      await events.send(
        new PutEventsCommand({
          trackingId: tracker.trackingId,
          userId: "visitor-7",
          sessionId: "session-1",
          eventList: [
            { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
          ],
        }),
      );
      await events.send(
        new PutItemsCommand({
          datasetArn: items.datasetArn,
          items: [{ itemId: "entry-1042" }],
        }),
      );
      await events.send(
        new PutUsersCommand({
          datasetArn: users.datasetArn,
          users: [{ userId: "visitor-7" }],
        }),
      );

      // Then all three are recorded, with nothing touching the network.
      const personalize = simSdk.simAws
        .account()
        .region("eu-west-2")
        .personalize();
      assertArrayEquals(
        personalize.recordedEvents().map((event) => event.itemId),
        ["entry-1042"],
      );
      assertArrayEquals(
        personalize.recordedItems().map((item) => item.itemId),
        ["entry-1042"],
      );
      assertArrayEquals(
        personalize.recordedUsers().map((user) => user.userId),
        ["visitor-7"],
      );
    } finally {
      simSdk.restoreAll();
    }
  });

  it("describes an event tracker created through an intercepted client", async () => {
    // Given an intercepted Personalize client.
    const simSdk = new SimSdk();
    simSdk.intercept(PersonalizeClient);

    const client = new PersonalizeClient({ region: "eu-west-2" });

    try {
      // When a tracker is created and then described.
      const group = await client.send(
        new CreateDatasetGroupCommand({ name: "catalogue" }),
      );
      const created = await client.send(
        new CreateEventTrackerCommand({
          name: "catalogue-events",
          datasetGroupArn: group.datasetGroupArn,
        }),
      );
      const described = await client.send(
        new DescribeEventTrackerCommand({
          eventTrackerArn: created.eventTrackerArn,
        }),
      );

      // Then the tracking ID the create handed out is the one it reports.
      assertNonNullable(described.eventTracker);
      assertIdentical(described.eventTracker.trackingId, created.trackingId);
    } finally {
      simSdk.restoreAll();
    }
  });

  it("supports the Commands its router names and no others", () => {
    // Given a simulated Personalize Events.
    const simAws = new SimAws();

    // When its router is asked what it handles.
    const supported = simAws.personalizeEvents().sdkCommandRouter();

    // Then every name is one the router has a route for.
    for (const commandName of supported.supportedCommandNames()) {
      assertNonNullable(supported.route(commandName));
    }

    assertUndefined(supported.route("PutActionsCommand"));
    assertArrayLength(supported.supportedCommandNames(), 3);
  });
});
