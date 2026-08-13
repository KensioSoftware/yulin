import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DescribeEventBusCommand,
  ListEventBusesCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimEventBridgeAccessDeniedException } from "../../error/sim-event-bridge.error.js";

/**
 * A simulated AWS with an `orders` bus, and a Role allowed only what a policy
 * statement says.
 */
async function simAwsWithRole(
  statement: object,
): Promise<{ simAws: SimAws; caller: SimAwsCaller }> {
  const simAws = new SimAws();

  await simAws
    .eventBridge()
    .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderPublisher",
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
      RoleName: "OrderPublisher",
      PolicyName: "PublishOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("EventBridge IAM authorization", () => {
  it("admits a caller whose policy names the bus ARN", async () => {
    // Given a Role allowed to put events on one bus.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    });

    // When it puts an event on that bus.
    const output = await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: "orders",
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: "{}",
          },
        ],
      }),
      { caller },
    );

    // Then it is allowed.
    assertIdentical(output.FailedEntryCount, 0);
  });

  it("refuses a caller putting events on a bus its policy does not name", async () => {
    // Given a Role allowed only the orders bus.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    });

    // When it puts an event on the default bus.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
          ],
        }),
        { caller },
      );
    });

    // Then it is refused, naming the action and the bus it could not reach.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
    assertStringIncludes(error.message, "events:PutEvents");
    assertStringIncludes(error.message, "event-bus/default");
  });

  it("refuses a bus ARN written without its resource type", async () => {
    // Given a Role whose policy leaves the event-bus/ out of the resource,
    // the way an SNS topic ARN would be written.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:orders",
    });

    // When it puts an event on the orders bus.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: "orders",
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
          ],
        }),
        { caller },
      );
    });

    // Then it matches nothing, as it matches nothing on real AWS.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
  });

  it("puts no event at all when one entry of a request is refused", async () => {
    // Given a Role allowed to put events on the orders bus only.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    });

    // When a request puts one entry on that bus and a later one on default.
    await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: "orders",
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
            {
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
          ],
        }),
        { caller },
      );
    });

    // Then the allowed entry was not delivered either, so a refused request
    // leaves nothing behind.
    assertArrayLength(simAws.eventBridge().eventsOn("orders"), 0);
  });

  it("refuses deleting the default bus with the permission error first", async () => {
    // Given a Role with no EventBridge permission at all.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When it deletes the default bus, which nobody may delete.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .deleteEventBus(new DeleteEventBusCommand({ Name: "default" }), {
          caller,
        });
    });

    // Then IAM decides first, as it does on real AWS, so the answer is the
    // permission one rather than the rule about the default bus.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
  });

  it("refuses creating and describing a bus without permission", async () => {
    // Given a Role allowed only to put events.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "*",
    });

    // When it creates a bus, and describes one.
    const created = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: "billing" }), {
          caller,
        });
    });
    const described = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeEventBus(new DescribeEventBusCommand({}), { caller });
    });

    // Then both are refused.
    assertInstanceOf(created, SimEventBridgeAccessDeniedException);
    assertInstanceOf(described, SimEventBridgeAccessDeniedException);
  });

  it("refuses a caller for a bus that does not exist, rather than saying so", async () => {
    // Given a Role with no EventBridge permission at all.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When it describes a bus that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .describeEventBus(new DescribeEventBusCommand({ Name: "secret" }), {
          caller,
        });
    });

    // Then the refusal is the permission one, so nothing leaks about which
    // buses the Account has.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
  });

  it("authorizes a listing against every bus rather than one", async () => {
    // Given a Role allowed to list only if the resource is everything.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:ListEventBuses",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    });

    // When it lists the buses.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .eventBridge()
        .listEventBuses(new ListEventBusesCommand({}), { caller });
    });

    // Then a policy naming one bus does not allow it, here as on real AWS.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);

    // And a policy whose resource is everything does.
    const { simAws: allowed, caller: listCaller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "events:ListEventBuses",
      Resource: "*",
    });
    const listed = await allowed
      .eventBridge()
      .listEventBuses(new ListEventBusesCommand({}), { caller: listCaller });

    assertNonNullable(listed.EventBuses);
  });
});
