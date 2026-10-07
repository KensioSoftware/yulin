import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  isPartnerEventSourceName,
  SimPartnerEventSourceName,
} from "./sim-partner-event-source-name.js";

describe("Partner event source names", () => {
  it("takes the aws.partner form with a partner and a name", () => {
    // Given names a partner such as Stripe gives its sources.
    const names = [
      "aws.partner/stripe.com/ed_test_billing",
      "aws.partner/example.com/orders/eu-west-2",
    ];

    // When each is read.
    const read = names.map((name) => isPartnerEventSourceName(name));

    // Then each is a partner event source name.
    assertTrue(read.every(Boolean));
  });

  it("refuses names outside the form real EventBridge takes", () => {
    // Given names missing a part of the form, or carrying a character or a
    // length it does not take.
    const names = [
      "orders",
      "stripe.com/ed_test_billing",
      "aws.partner/stripe.com",
      "aws.partner/stripe.com/ed test",
      "aws.partner/stripe.com//ed_test",
      `aws.partner/stripe.com/${"a".repeat(250)}`,
    ];

    // When each is read.
    const read = names.map((name) => isPartnerEventSourceName(name));

    // Then none of them is a partner event source name.
    assertFalse(read.some(Boolean));
  });

  it("names the partner that created the source", () => {
    // Given one of Stripe's source names.
    const name = SimPartnerEventSourceName.of(
      "aws.partner/stripe.com/ed_test_billing",
      "Name",
    );

    // When the partner is read from it.
    // Then it is the segment after aws.partner.
    assertIdentical(name.partner, "stripe.com");
  });
});
