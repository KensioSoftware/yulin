import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { eventBusArnPrefix, parseEventBusArn } from "./sim-event-bus-arn.js";
import { SimEventBusArn } from "./sim-event-bus-arn.js";
import { SimEventBusName } from "./sim-event-bus-name.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";

describe("EventBridge event bus ARN", () => {
  it("builds an ARN carrying the event-bus resource type", () => {
    // Given a bus name in an Account and Region.
    const scope = simAwsAccountRegionScopeFactory.make();
    const arn = new SimEventBusArn({
      name: SimEventBusName.of("orders"),
      accountRegionScope: scope,
    });

    // Then the ARN puts the type in front of the name, unlike an SNS topic.
    const expected = `arn:aws:events:${scope.regionName}:${scope.accountId}:event-bus/`;

    assertIdentical(arn.value, `${expected}orders`);
    assertIdentical(arn.name, "orders");
    assertIdentical(eventBusArnPrefix(scope), expected);
  });

  it("reads the Region, Account and name out of an ARN", () => {
    // Given an event bus ARN.
    const parsed = parseEventBusArn(
      "arn:aws:events:eu-west-2:111111111111:event-bus/orders",
    );

    // Then all three come back.
    assertObjectEquals(parsed, {
      regionName: "eu-west-2",
      accountId: "111111111111",
      name: "orders",
    });
  });

  it("reads nothing out of a string that is not an event bus ARN", () => {
    // Given strings that are each wrong in one way.
    const notArns = [
      // Too few parts.
      "arn:aws:events:eu-west-2:event-bus/orders",
      // Too many parts, which is what a rule on a custom bus looks like.
      "arn:aws:events:eu-west-2:111111111111:rule/orders:matcher",
      // Not an ARN at all.
      "orders",
      // Another partition.
      "arn:aws-cn:events:eu-west-2:111111111111:event-bus/orders",
      // Another service.
      "arn:aws:sns:eu-west-2:111111111111:event-bus/orders",
      // No Region.
      "arn:aws:events::111111111111:event-bus/orders",
      // No Account.
      "arn:aws:events:eu-west-2::event-bus/orders",
      // Another resource type in the same service.
      "arn:aws:events:eu-west-2:111111111111:rule/orders",
      // The right resource type with no name after it.
      "arn:aws:events:eu-west-2:111111111111:event-bus/",
      // No resource type separator at all.
      "arn:aws:events:eu-west-2:111111111111:orders",
    ];

    // Then none of them reads as a bus location.
    for (const notArn of notArns) {
      assertUndefined(parseEventBusArn(notArn));
    }
  });
});
