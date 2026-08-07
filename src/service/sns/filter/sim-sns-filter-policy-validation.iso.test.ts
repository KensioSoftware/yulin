import { assertInstanceOf, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsFilterPolicyRefusal,
  simSnsFilteringSubscription,
  simSnsSubscriptionAttributeRefusal,
} from "../../../../test/sns/filter-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

describe("SNS filter policy validation", () => {
  it("refuses a cidr match, naming the operator", () => {
    // Given a policy matching an IP range.
    const policy = { ip: [{ cidr: "10.0.0.0/24" }] };

    // When it is set on a subscription.
    const error = simSnsFilterPolicyRefusal(policy);

    // Then it is refused when it is set rather than accepted and then matching
    // nothing, which would look like filtering that worked.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
    assertStringIncludes(error.message, "cidr is not simulated");
  });

  it("refuses an operator real SNS does not have", () => {
    // Given a policy naming an operator that does not exist.
    const error = simSnsFilterPolicyRefusal({ type: [{ contains: "order" }] });

    // Then it is refused rather than matching nothing.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "contains is not a match operator");
  });

  it("refuses a match condition naming two operators", () => {
    // Given a match condition holding a prefix and a suffix at once.
    const error = simSnsFilterPolicyRefusal({
      name: [{ prefix: "order-", suffix: ".csv" }],
    });

    // Then it is refused, since real SNS takes one operator per condition and
    // nothing says how two would be combined.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "names one operator");
  });

  it("refuses a policy that is not a JSON object", () => {
    // Given values that are not a policy document.
    const notJson = simSnsSubscriptionAttributeRefusal({
      FilterPolicy: "{ nope",
    });
    const notAnObject = simSnsSubscriptionAttributeRefusal({
      FilterPolicy: JSON.stringify(["order"]),
    });

    // Then each is refused when it is set.
    assertStringIncludes(notJson.message, "is not a JSON document");
    assertStringIncludes(
      notAnObject.message,
      "keys and their match conditions",
    );
  });

  it("refuses a key holding something other than match conditions", () => {
    // Given a key holding a value rather than a list of conditions.
    const error = simSnsFilterPolicyRefusal({ type: "order" });

    // Then it is refused, rather than guessed at.
    assertStringIncludes(error.message, "holds a list of match conditions");
  });

  it("refuses a key holding no match conditions", () => {
    // Given a key holding an empty list.
    const error = simSnsFilterPolicyRefusal({ type: [] });

    // Then it is refused, since nothing could ever match it.
    assertStringIncludes(error.message, "holds no match conditions");
  });

  it("refuses a match condition that is neither a value nor an operator", () => {
    // Given a condition holding a list and one holding null.
    const listed = simSnsFilterPolicyRefusal({ type: [["order"]] });
    const nothing = simSnsFilterPolicyRefusal({ type: [null] });

    // Then each is refused.
    assertStringIncludes(listed.message, "a match condition is a string");
    assertStringIncludes(nothing.message, "a match condition is a string");
  });

  it("refuses a numeric match that is not a comparator and a number", () => {
    // Given numeric conditions written the wrong way round.
    const refusals = [
      simSnsFilterPolicyRefusal({ amount: [{ numeric: ">" }] }),
      simSnsFilterPolicyRefusal({ amount: [{ numeric: [] }] }),
      simSnsFilterPolicyRefusal({ amount: [{ numeric: [">"] }] }),
      simSnsFilterPolicyRefusal({ amount: [{ numeric: ["~", 1] }] }),
      simSnsFilterPolicyRefusal({ amount: [{ numeric: [1, 2] }] }),
      simSnsFilterPolicyRefusal({ amount: [{ numeric: [">", "1"] }] }),
    ];

    // Then each is refused when the policy is set.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
      assertStringIncludes(error.message, "numeric ");
    }
  });

  it("refuses a string operator written without a string", () => {
    // Given operators given the wrong kind of operand.
    const prefixed = simSnsFilterPolicyRefusal({ name: [{ prefix: 1 }] });
    const cased = simSnsFilterPolicyRefusal({
      name: [{ "equals-ignore-case": ["a"] }],
    });
    const existing = simSnsFilterPolicyRefusal({ name: [{ exists: "true" }] });

    // Then each is refused with what it wanted.
    assertStringIncludes(prefixed.message, "prefix takes a string");
    assertStringIncludes(cased.message, "equals-ignore-case takes a string");
    assertStringIncludes(existing.message, "exists match is true or false");
  });

  it("refuses an anything-but holding an operator it cannot exclude", () => {
    // Given an anything-but around a numeric match.
    const error = simSnsFilterPolicyRefusal({
      amount: [{ "anything-but": { numeric: [">", 1] } }],
    });

    // Then it is refused: real SNS excludes by value, prefix, suffix or case.
    assertStringIncludes(error.message, "anything-but takes a value");
  });

  it("refuses an or that is not a list of policies", () => {
    // Given an $or written as something else.
    const notAList = simSnsFilterPolicyRefusal({ $or: { type: ["order"] } });
    const empty = simSnsFilterPolicyRefusal({ $or: [] });
    const notAPolicy = simSnsFilterPolicyRefusal({ $or: ["order"] });

    // Then each is refused.
    assertStringIncludes(notAList.message, "$or takes a list");
    assertStringIncludes(empty.message, "$or holds no alternatives");
    assertStringIncludes(notAPolicy.message, "a policy of its own");
  });

  it("refuses a nested key under the message attributes scope", () => {
    // Given a policy nesting one key under another.
    const policy = { customer: { tier: ["gold"] } };

    // When it is set for each scope.
    const refused = simSnsFilterPolicyRefusal(policy);
    const accepted = simSnsFilteringSubscription(policy, "MessageBody");

    // Then the body scope takes it and the attribute scope does not: message
    // attributes are a flat set of names, so it could never match there.
    assertStringIncludes(refused.message, "is a nested key");
    assertStringIncludes(refused.message, "MessageAttributes scope");
    assertStringIncludes(accepted.filterPolicyScope.value, "MessageBody");
  });

  it("refuses a filter policy scope real SNS does not have", () => {
    // Given a scope of some other name.
    const error = simSnsSubscriptionAttributeRefusal({
      FilterPolicyScope: "MessageSubject",
    });

    // Then it is refused rather than treated as the default.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "is not a filter policy scope");
  });

  it("refuses a policy the new scope cannot take", () => {
    // Given a subscription holding a nested policy of the body scope.
    const held = simSnsFilteringSubscription(
      { customer: { tier: ["gold"] } },
      "MessageBody",
    );

    // When the scope is moved to the message attributes.
    const error = simSnsSubscriptionAttributeRefusal(
      { FilterPolicyScope: "MessageAttributes" },
      held,
    );

    // Then it is refused there, rather than left in place matching nothing.
    assertStringIncludes(error.message, "is a nested key");
  });
});
