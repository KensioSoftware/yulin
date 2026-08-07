import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsFilterMatchesBody,
  simSnsFilteringSubscription,
  simSnsPublishedMessage,
  simSnsStringAttribute,
} from "../../../../test/sns/filter-fixture.js";

describe("SNS filter policy message body matching", () => {
  it("matches a key of the published body", () => {
    // Given a policy about the body rather than the attributes.
    const policy = { type: ["order"] };

    // When bodies carrying each kind are matched.
    // Then the policy reads the body it was given.
    assertTrue(
      simSnsFilterMatchesBody(policy, JSON.stringify({ type: "order" })),
    );
    assertFalse(
      simSnsFilterMatchesBody(policy, JSON.stringify({ type: "refund" })),
    );
  });

  it("matches a nested key", () => {
    // Given a policy nesting the way the body does.
    const policy = { customer: { tier: ["gold"] } };

    // When bodies with each tier are matched.
    // Then the nesting is the path into the body.
    assertTrue(
      simSnsFilterMatchesBody(
        policy,
        JSON.stringify({ customer: { tier: "gold", id: "c-1" } }),
      ),
    );
    assertFalse(
      simSnsFilterMatchesBody(
        policy,
        JSON.stringify({ customer: { tier: "silver" } }),
      ),
    );
    assertFalse(
      simSnsFilterMatchesBody(policy, JSON.stringify({ customer: 1 })),
    );
  });

  it("matches the numbers and booleans a body holds", () => {
    // Given policies about a JSON number and a JSON boolean.
    const numeric = { amount: [{ numeric: [">", 100] }] };
    const logical = { paid: [true] };

    // When bodies holding each are matched.
    // Then a body needs no data types for either: JSON has them.
    assertTrue(
      simSnsFilterMatchesBody(numeric, JSON.stringify({ amount: 150 })),
    );
    assertFalse(
      simSnsFilterMatchesBody(numeric, JSON.stringify({ amount: 50 })),
    );
    assertTrue(
      simSnsFilterMatchesBody(logical, JSON.stringify({ paid: true })),
    );
    assertFalse(
      simSnsFilterMatchesBody(logical, JSON.stringify({ paid: false })),
    );
  });

  it("matches any member of a list the body holds", () => {
    // Given a policy naming one region.
    const policy = { regions: ["eu-west-2"] };

    // When a body holding a list of them is matched.
    // Then any member matching is the key matching.
    assertTrue(
      simSnsFilterMatchesBody(
        policy,
        JSON.stringify({ regions: ["us-east-1", "eu-west-2"] }),
      ),
    );
    assertFalse(
      simSnsFilterMatchesBody(
        policy,
        JSON.stringify({ regions: ["us-east-1"] }),
      ),
    );
  });

  it("finds nothing at a key holding null or an object", () => {
    // Given a policy asking for a key to be missing.
    const policy = { customer: [{ exists: false }] };

    // When bodies holding null and an object at that key are matched.
    // Then neither holds a value to match, so the key counts as missing.
    assertTrue(
      simSnsFilterMatchesBody(policy, JSON.stringify({ customer: null })),
    );
    assertTrue(
      simSnsFilterMatchesBody(policy, JSON.stringify({ customer: { id: 1 } })),
    );
    assertFalse(
      simSnsFilterMatchesBody(policy, JSON.stringify({ customer: "c-1" })),
    );
  });

  it("fails to match a body that is not a JSON object", () => {
    // Given a policy about the body.
    const policy = { type: ["order"] };

    // When bodies that are not a JSON object are matched.
    // Then none of them matches, and none of them throws: the body comes from
    // whoever published, and the scope is the subscription's own business.
    assertFalse(simSnsFilterMatchesBody(policy, "order-1"));
    assertFalse(simSnsFilterMatchesBody(policy, "{ not json"));
    assertFalse(simSnsFilterMatchesBody(policy, JSON.stringify(["order"])));
    assertFalse(simSnsFilterMatchesBody(policy, JSON.stringify("order")));
  });

  it("ignores the message attributes under this scope", () => {
    // Given a policy of the MessageBody scope.
    const policy = { type: ["order"] };

    // When a message carrying the value as an attribute is matched.
    const message = simSnsPublishedMessage("order-1", {
      type: simSnsStringAttribute("order"),
    });
    const matched = simSnsFilteringSubscription(policy, "MessageBody").accepts(
      message,
    );

    // Then it does not match, since the scope says where to look.
    assertFalse(matched);
  });

  it("keeps its policy when another attribute is set", () => {
    // Given a subscription filtering on the body.
    const held = simSnsFilteringSubscription(
      { type: ["order"] },
      "MessageBody",
    );

    // When an unrelated attribute is set on it.
    const raw = held.with({ RawMessageDelivery: "true" });

    // Then the policy is the one it already had, still read under its own
    // scope.
    const order = simSnsPublishedMessage(JSON.stringify({ type: "order" }));

    assertTrue(raw.rawMessageDelivery);
    assertTrue(raw.accepts(order));
  });

  it("goes back to the default scope when the scope is cleared", () => {
    // Given a subscription filtering on the body.
    const held = simSnsFilteringSubscription(
      { type: ["order"] },
      "MessageBody",
    );

    // When the scope is set with no value, which is how SNS is told to clear
    // an attribute.
    const cleared = held.with({ FilterPolicyScope: "" });

    // Then the policy is read against the message attributes again.
    const order = simSnsPublishedMessage("order-1", {
      type: simSnsStringAttribute("order"),
    });

    assertTrue(cleared.accepts(order));
  });

  it("reads the policy again when the scope changes", () => {
    // Given a subscription filtering on the body.
    const held = simSnsFilteringSubscription(
      { type: ["order"] },
      "MessageBody",
    );

    // When the scope is moved to the message attributes.
    const moved = held.with({ FilterPolicyScope: "MessageAttributes" });

    // Then the same policy now matches the attribute instead of the body.
    const asBody = simSnsPublishedMessage(JSON.stringify({ type: "order" }));
    const asAttribute = simSnsPublishedMessage("order-1", {
      type: simSnsStringAttribute("order"),
    });

    assertFalse(moved.accepts(asBody));
    assertTrue(moved.accepts(asAttribute));
  });
});
