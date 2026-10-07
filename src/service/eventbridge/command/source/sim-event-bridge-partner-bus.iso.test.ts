import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand,
  DescribeEventSourceCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import {
  SimEventBridgeAccessDeniedException,
  SimEventBridgeResourceAlreadyExistsException,
  SimEventBridgeResourceNotFoundException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

describe("EventBridge partner event buses", () => {
  const sourceName = "aws.partner/stripe.com/ed_test_billing";

  it("creates a partner event bus that activates its source", async () => {
    // Given a partner event source Stripe has shared with the Account.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
      clock: new SimFixedClock(new Date("2026-10-07T09:00:00.000Z")),
    });
    simAws.eventBridge().addPartnerEventSource(sourceName);

    const pending = await simAws
      .eventBridge()
      .describeEventSource(
        new DescribeEventSourceCommand({ Name: sourceName }),
      );

    // When the Account creates the matching bus.
    const created = await simAws.eventBridge().createEventBus(
      new CreateEventBusCommand({
        Name: sourceName,
        EventSourceName: sourceName,
      }),
    );

    // Then the bus has the partner name in its ARN.
    assertIdentical(
      created.EventBusArn,
      `arn:aws:events:eu-west-2:111111111111:event-bus/${sourceName}`,
    );

    // And the source went from pending to active.
    assertIdentical(pending.State, "PENDING");

    const active = await simAws
      .eventBridge()
      .describeEventSource(
        new DescribeEventSourceCommand({ Name: sourceName }),
      );

    assertIdentical(active.State, "ACTIVE");
    assertIdentical(
      active.Arn,
      `arn:aws:events:eu-west-2::event-source/${sourceName}`,
    );
    assertIdentical(active.CreatedBy, "stripe.com");
    assertIdentical(
      active.CreationTime?.toISOString(),
      "2026-10-07T09:00:00.000Z",
    );

    // And the bus can be described by its name.
    const described = await simAws
      .eventBridge()
      .describeEventBus(new DescribeEventBusCommand({ Name: sourceName }));

    assertIdentical(described.Name, sourceName);
  });

  it("puts a source back to pending when its bus is deleted", async () => {
    // Given an active partner event source.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);
    await simAws.eventBridge().createEventBus(
      new CreateEventBusCommand({
        Name: sourceName,
        EventSourceName: sourceName,
      }),
    );

    // When its bus is deleted.
    await simAws
      .eventBridge()
      .deleteEventBus(new DeleteEventBusCommand({ Name: sourceName }));

    // Then the source is pending again.
    const described = await simAws
      .eventBridge()
      .describeEventSource(
        new DescribeEventSourceCommand({ Name: sourceName }),
      );

    assertIdentical(described.State, "PENDING");
  });

  it("refuses a partner bus for a source nobody shared", async () => {
    // Given an Account no partner has shared a source with.
    const simAws = new SimAws();

    // When it creates a partner event bus anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().createEventBus(
        new CreateEventBusCommand({
          Name: sourceName,
          EventSourceName: sourceName,
        }),
      );
    });

    // Then it is refused as real EventBridge refuses it, so a deployment
    // that would fail on AWS fails here.
    assertInstanceOf(error, SimEventBridgeResourceNotFoundException);
    assertStringIncludes(error.message, sourceName);
  });

  it("refuses a partner bus named other than its source", async () => {
    // Given a shared partner event source.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);

    // When a bus is created for it under a different name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().createEventBus(
        new CreateEventBusCommand({
          Name: "billing",
          EventSourceName: sourceName,
        }),
      );
    });

    // Then it is refused, since the two names have to match exactly.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "exactly");
  });

  it("refuses a partner bus name on a bus with no source", async () => {
    // Given a shared partner event source.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);

    // When a bus is created under its name with no EventSourceName.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: sourceName }));
    });

    // Then it is refused, because only a partner bus carries a '/'.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "EventSourceName");
  });

  it("refuses an EventSourceName that is not a partner source name", async () => {
    // Given a simulated EventBridge.
    const simAws = new SimAws();

    // When a bus names a source outside the aws.partner form.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().createEventBus(
        new CreateEventBusCommand({
          Name: "billing",
          EventSourceName: "stripe.com/billing",
        }),
      );
    });

    // Then the source name is refused, naming the parameter.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "EventSourceName");
  });

  it("refuses to share the same source twice", () => {
    // Given a shared partner event source.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);

    // When the partner shares it again.
    const error = assertThrowsError(() => {
      simAws.eventBridge().addPartnerEventSource(sourceName);
    });

    // Then it is refused, as the partner's CreatePartnerEventSource is.
    assertInstanceOf(error, SimEventBridgeResourceAlreadyExistsException);
  });

  it("refuses to describe a source that is missing or misnamed", async () => {
    // Given an Account no partner has shared a source with.
    const simAws = new SimAws();

    // When sources are described by a missing, malformed and absent name.
    const missing = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeEventSource(
          new DescribeEventSourceCommand({ Name: sourceName }),
        );
    });
    const malformed = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeEventSource(
          new DescribeEventSourceCommand({ Name: "orders" }),
        );
    });
    const absent = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().describeEventSource({ input: {} });
    });

    // Then each is refused the way real EventBridge refuses it.
    assertInstanceOf(missing, SimEventBridgeResourceNotFoundException);
    assertInstanceOf(malformed, SimEventBridgeValidationException);
    assertInstanceOf(absent, SimEventBridgeValidationException);
  });

  it("authorizes describing a source against the source ARN", async () => {
    // Given a shared source, and a Role allowed to describe only that source.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);
    simAws.eventBridge().addPartnerEventSource(`${sourceName}_other`);

    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "BillingReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "BillingReader",
        PolicyName: "DescribeBillingSource",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "events:DescribeEventSource",
            Resource: `arn:aws:events:us-east-1::event-source/${sourceName}`,
          },
        }),
      }),
    );
    const caller: SimAwsCaller = { kind: "arn", arn: role.Role.Arn };

    // When it describes that source and another.
    const allowed = await simAws
      .eventBridge()
      .describeEventSource(
        new DescribeEventSourceCommand({ Name: sourceName }),
        {
          caller,
        },
      );
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeEventSource(
          new DescribeEventSourceCommand({ Name: `${sourceName}_other` }),
          { caller },
        );
    });

    // Then only the source its policy names is described.
    assertIdentical(allowed.Name, sourceName);
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
    assertStringIncludes(error.message, `event-source/${sourceName}_other`);
  });
});
