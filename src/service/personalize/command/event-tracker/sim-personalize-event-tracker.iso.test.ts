import {
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
  DeleteDatasetGroupCommand,
  DeleteEventTrackerCommand,
  DescribeEventTrackerCommand,
  ListEventTrackersCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const accountIdOneOnes = "111111111111";

async function givenADatasetGroup(
  simAws: SimAws,
  name = "catalogue",
): Promise<string> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(new CreateDatasetGroupCommand({ name }));

  assertNonNullable(group.datasetGroupArn);

  return group.datasetGroupArn;
}

describe("Personalize CreateEventTracker", () => {
  it("reports a tracking ID and its own ARN back", async () => {
    // Given a simulated AWS holding a dataset group.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const datasetGroupArn = await givenADatasetGroup(simAws);

    // When an event tracker is created against it.
    const created = await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "catalogue-events",
        datasetGroupArn,
      }),
    );

    // Then it carries both handles, and the ARN names the tracker.
    assertNonNullable(created.trackingId);
    assertNonNullable(created.eventTrackerArn);
    assertStringIncludes(
      created.eventTrackerArn,
      `arn:aws:personalize:us-east-1:${accountIdOneOnes}:event-tracker/` +
        `catalogue-events`,
    );
  });

  it("refuses a second tracker on the same dataset group", async () => {
    // Given a dataset group that already has an event tracker.
    const simAws = new SimAws();
    const datasetGroupArn = await givenADatasetGroup(simAws);
    await simAws
      .personalize()
      .createEventTracker(
        new CreateEventTrackerCommand({ name: "first", datasetGroupArn }),
      );

    // When a second one is created against it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createEventTracker(
            new CreateEventTrackerCommand({ name: "second", datasetGroupArn }),
          ),
    );

    // Then Personalize refuses it. One dataset group takes one tracker.
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });

  it("refuses a dataset group nothing holds", async () => {
    // Given a simulated AWS with no dataset groups at all.
    const simAws = new SimAws();

    // When a tracker is created against an ARN naming nothing.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createEventTracker(
          new CreateEventTrackerCommand({
            name: "catalogue-events",
            datasetGroupArn:
              "arn:aws:personalize:eu-west-2:000000000000:dataset-group/gone",
          }),
        ),
    );

    // Then the missing dataset group is what is reported.
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});

describe("Personalize DescribeEventTracker", () => {
  it("reports the dataset group, the tracking ID and the account", async () => {
    // Given an event tracker on a dataset group.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const datasetGroupArn = await givenADatasetGroup(simAws);
    const created = await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "catalogue-events",
        datasetGroupArn,
      }),
    );

    // When it is described.
    const described = await simAws.personalize().describeEventTracker(
      new DescribeEventTrackerCommand({
        eventTrackerArn: created.eventTrackerArn,
      }),
    );

    // Then everything the create decided comes back.
    assertNonNullable(described.eventTracker);
    assertIdentical(described.eventTracker.name, "catalogue-events");
    assertIdentical(described.eventTracker.datasetGroupArn, datasetGroupArn);
    assertIdentical(described.eventTracker.trackingId, created.trackingId);
    assertIdentical(described.eventTracker.accountId, accountIdOneOnes);
    assertIdentical(described.eventTracker.status, "ACTIVE");
  });
});

describe("Personalize ListEventTrackers", () => {
  it("lists only the trackers of the dataset group named", async () => {
    // Given two dataset groups with a tracker each.
    const simAws = new SimAws();
    const catalogue = await givenADatasetGroup(simAws, "catalogue");
    const storefront = await givenADatasetGroup(simAws, "storefront");
    await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "catalogue-events",
        datasetGroupArn: catalogue,
      }),
    );
    await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "storefront-events",
        datasetGroupArn: storefront,
      }),
    );

    // When one group's trackers are listed.
    const listed = await simAws
      .personalize()
      .listEventTrackers(
        new ListEventTrackersCommand({ datasetGroupArn: storefront }),
      );

    // Then the other group's tracker is left out.
    assertArrayEquals(
      (listed.eventTrackers ?? []).map((tracker) => tracker.name),
      ["storefront-events"],
    );
  });

  it("lists every tracker where no dataset group is named", async () => {
    // Given trackers on two dataset groups.
    const simAws = new SimAws();
    await Promise.all(
      ["catalogue", "storefront"].map(async (name) => {
        const datasetGroupArn = await givenADatasetGroup(simAws, name);

        await simAws.personalize().createEventTracker(
          new CreateEventTrackerCommand({
            name: `${name}-events`,
            datasetGroupArn,
          }),
        );
      }),
    );

    // When they are listed without a filter.
    const listed = await simAws
      .personalize()
      .listEventTrackers(new ListEventTrackersCommand({}));

    // Then both come back.
    assertArrayLength(listed.eventTrackers ?? [], 2);
  });

  it("pages through the trackers and leaves the tracking ID out", async () => {
    // Given three dataset groups with a tracker each.
    const simAws = new SimAws();
    await Promise.all(
      ["catalogue", "storefront", "lessons"].map(async (name) => {
        const datasetGroupArn = await givenADatasetGroup(simAws, name);

        await simAws.personalize().createEventTracker(
          new CreateEventTrackerCommand({
            name: `${name}-events`,
            datasetGroupArn,
          }),
        );
      }),
    );

    // When they are listed two at a time.
    const first = await simAws
      .personalize()
      .listEventTrackers(new ListEventTrackersCommand({ maxResults: 2 }));
    const second = await simAws.personalize().listEventTrackers(
      new ListEventTrackersCommand({
        maxResults: 2,
        nextToken: first.nextToken,
      }),
    );

    // Then the two pages carry the three between them, and the second one ends
    // the listing.
    assertArrayLength(first.eventTrackers ?? [], 2);
    assertArrayLength(second.eventTrackers ?? [], 1);
    assertUndefined(second.nextToken);

    // And a summary reports no tracking ID. Real Personalize reports one from
    // Describe alone.
    const [summary] = first.eventTrackers ?? [];
    assertNonNullable(summary);
    assertFalse("trackingId" in summary);
  });
});

describe("Personalize DeleteEventTracker", () => {
  it("leaves the tracker unfindable afterwards", async () => {
    // Given an event tracker.
    const simAws = new SimAws();
    const datasetGroupArn = await givenADatasetGroup(simAws);
    const created = await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "catalogue-events",
        datasetGroupArn,
      }),
    );

    // When it is deleted.
    await simAws.personalize().deleteEventTracker(
      new DeleteEventTrackerCommand({
        eventTrackerArn: created.eventTrackerArn,
      }),
    );

    // Then describing it reports it missing.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().describeEventTracker(
          new DescribeEventTrackerCommand({
            eventTrackerArn: created.eventTrackerArn,
          }),
        ),
    );
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("has to happen before the dataset group can be deleted", async () => {
    // Given a dataset group with an event tracker on it.
    const simAws = new SimAws();
    const datasetGroupArn = await givenADatasetGroup(simAws);
    await simAws.personalize().createEventTracker(
      new CreateEventTrackerCommand({
        name: "catalogue-events",
        datasetGroupArn,
      }),
    );

    // When the dataset group is deleted first.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .deleteDatasetGroup(
            new DeleteDatasetGroupCommand({ datasetGroupArn }),
          ),
    );

    // Then Personalize reports the group as in use.
    assertIdentical(error.name, "ResourceInUseException");
    assertStringIncludes(error.message, "event tracker(s) on it");
  });
});
