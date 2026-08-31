import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
} from "@aws-sdk/client-personalize";
import { PutEventsCommand } from "@aws-sdk/client-personalize-events";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

interface EventTracker {
  readonly arn: string;
  readonly trackingId: string;
}

/**
 * An event tracker to send interactions to.
 */
async function givenAnEventTracker(simAws: SimAws): Promise<EventTracker> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));
  const tracker = await simAws.personalize().createEventTracker(
    new CreateEventTrackerCommand({
      name: "catalogue-events",
      datasetGroupArn: group.datasetGroupArn,
    }),
  );

  assertNonNullable(tracker.eventTrackerArn);
  assertNonNullable(tracker.trackingId);

  return { arn: tracker.eventTrackerArn, trackingId: tracker.trackingId };
}

/**
 * A Role whose policy allows one action on one resource.
 */
async function givenARoleAllowedTo(
  simAws: SimAws,
  action: string,
  resource = "*",
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "PersonalizeEventsCaller",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "PersonalizeEventsCaller",
      PolicyName: "PersonalizeEventsPolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: action, Resource: resource },
      }),
    }),
  );

  assertNonNullable(role.Role.Arn);

  return role.Role.Arn;
}

describe("Personalize Events IAM authorization", () => {
  it("allows a PutEvents the caller's policy permits on the tracker", async () => {
    // Given a Role allowed to send events to one event tracker.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const tracker = await givenAnEventTracker(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:PutEvents",
      tracker.arn,
    );

    // When it sends an interaction.
    await simAws.personalizeEvents().putEvents(
      new PutEventsCommand({
        trackingId: tracker.trackingId,
        sessionId: "session-1",
        eventList: [
          { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
        ],
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the interaction is recorded.
    assertArrayLength(simAws.personalize().recordedEvents(), 1);
  });

  it("denies a PutEvents against a tracker the policy leaves out", async () => {
    // Given a Role allowed to send events to some other tracker.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const tracker = await givenAnEventTracker(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:PutEvents",
      `arn:aws:personalize:us-east-1:${accountIdOneOnes}:event-tracker/other`,
    );

    // When it sends an interaction to this one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putEvents(
          new PutEventsCommand({
            trackingId: tracker.trackingId,
            sessionId: "session-1",
            eventList: [
              { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
            ],
          }),
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then Personalize reports it in its own terms, and records nothing.
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "personalize:PutEvents");
    assertArrayEmpty(simAws.personalize().recordedEvents());
  });

  it("tells a denied caller nothing about a tracking ID nothing holds", async () => {
    // Given a Role allowed to send events to one event tracker only.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const tracker = await givenAnEventTracker(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:PutEvents",
      tracker.arn,
    );

    // When it sends an interaction to a tracking ID nothing holds.
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
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then it learns it has no permission. Whether the tracker exists stays
    // hidden, as it does on every other Personalize operation.
    assertIdentical(error.name, "AccessDeniedException");
  });
});
