import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsFilterMatchesAttributes,
  simSnsStringAttribute,
} from "../../../../test/sns/filter-fixture.js";
import type { JSONObject } from "../../../util/type-guard/json.js";

/**
 * Whether a policy matches a message carrying one `type` attribute.
 */
function matchesType(policy: JSONObject, type: string): boolean {
  return simSnsFilterMatchesAttributes(policy, {
    type: simSnsStringAttribute(type),
  });
}

describe("SNS filter policy string matching", () => {
  it("matches a value the policy names and nothing else", () => {
    // Given a policy naming one kind of message.
    const policy = { type: ["order"] };

    // When messages of each kind are matched against it.
    // Then only the one it names matches, and matching is case sensitive.
    assertTrue(matchesType(policy, "order"));
    assertFalse(matchesType(policy, "refund"));
    assertFalse(matchesType(policy, "Order"));
  });

  it("reads a list of values as an or", () => {
    // Given a policy naming two kinds of message.
    const policy = { type: ["order", "refund"] };

    // When messages of each kind are matched against it.
    // Then either one matches, since the list is an or.
    assertTrue(matchesType(policy, "order"));
    assertTrue(matchesType(policy, "refund"));
    assertFalse(matchesType(policy, "invoice"));
  });

  it("requires every key of the policy to match", () => {
    // Given a policy about two attributes.
    const policy = { type: ["order"], tenant: ["acme"] };

    // When a message carrying only one of them is matched.
    const one = simSnsFilterMatchesAttributes(policy, {
      type: simSnsStringAttribute("order"),
    });
    const both = simSnsFilterMatchesAttributes(policy, {
      type: simSnsStringAttribute("order"),
      tenant: simSnsStringAttribute("acme"),
    });

    // Then both keys have to match, since separate keys are an and.
    assertFalse(one);
    assertTrue(both);
  });

  it("matches on the start and the end of a value", () => {
    // Given a policy about the start of one value and the end of another.
    const prefixed = { name: [{ prefix: "order-" }] };
    const suffixed = { name: [{ suffix: ".csv" }] };

    // When names are matched against each.
    // Then each matches on its own end of the value.
    assertTrue(
      simSnsFilterMatchesAttributes(prefixed, {
        name: simSnsStringAttribute("order-1.csv"),
      }),
    );
    assertFalse(
      simSnsFilterMatchesAttributes(prefixed, {
        name: simSnsStringAttribute("refund-1.csv"),
      }),
    );
    assertTrue(
      simSnsFilterMatchesAttributes(suffixed, {
        name: simSnsStringAttribute("order-1.csv"),
      }),
    );
    assertFalse(
      simSnsFilterMatchesAttributes(suffixed, {
        name: simSnsStringAttribute("order-1.json"),
      }),
    );
  });

  it("matches a value in any case when asked to", () => {
    // Given a policy matching without regard to case.
    const policy = { type: [{ "equals-ignore-case": "Order" }] };

    // When values differing only in case are matched.
    // Then each matches, and a different value still does not.
    assertTrue(matchesType(policy, "ORDER"));
    assertTrue(matchesType(policy, "order"));
    assertFalse(matchesType(policy, "refund"));
  });

  it("excludes the values an anything-but names", () => {
    // Given a policy excluding one value and one excluding two.
    const one = { type: [{ "anything-but": "order" }] };
    const two = { type: [{ "anything-but": ["order", "refund"] }] };

    // When values are matched against each.
    // Then everything but the named ones matches.
    assertFalse(matchesType(one, "order"));
    assertTrue(matchesType(one, "refund"));
    assertFalse(matchesType(two, "refund"));
    assertTrue(matchesType(two, "invoice"));
  });

  it("excludes on the start, the end and the case of a value", () => {
    // Given policies excluding by shape rather than by value.
    const prefixed = { name: [{ "anything-but": { prefix: "order-" } }] };
    const suffixed = { name: [{ "anything-but": { suffix: ".csv" } }] };
    const cased = {
      name: [{ "anything-but": { "equals-ignore-case": "Order" } }],
    };

    // When names are matched against each.
    // Then each excludes what the operator inside it would have matched.
    assertFalse(
      simSnsFilterMatchesAttributes(prefixed, {
        name: simSnsStringAttribute("order-1"),
      }),
    );
    assertTrue(
      simSnsFilterMatchesAttributes(prefixed, {
        name: simSnsStringAttribute("refund-1"),
      }),
    );
    assertFalse(
      simSnsFilterMatchesAttributes(suffixed, {
        name: simSnsStringAttribute("order-1.csv"),
      }),
    );
    assertTrue(
      simSnsFilterMatchesAttributes(suffixed, {
        name: simSnsStringAttribute("order-1.json"),
      }),
    );
    assertFalse(
      simSnsFilterMatchesAttributes(cased, {
        name: simSnsStringAttribute("ORDER"),
      }),
    );
    assertTrue(
      simSnsFilterMatchesAttributes(cased, {
        name: simSnsStringAttribute("orders"),
      }),
    );
  });

  it("asks whether an attribute is there at all", () => {
    // Given a policy about an attribute being there, and one about it not
    // being there.
    const present = { type: [{ exists: true }] };
    const absent = { type: [{ exists: false }] };
    const carried = { type: simSnsStringAttribute("order") };
    const other = { tenant: simSnsStringAttribute("acme") };

    // When a message carrying the attribute and one carrying another are
    // matched.
    // Then each policy matches the one it asks for.
    assertTrue(simSnsFilterMatchesAttributes(present, carried));
    assertFalse(simSnsFilterMatchesAttributes(present, other));
    assertFalse(simSnsFilterMatchesAttributes(absent, carried));
    assertTrue(simSnsFilterMatchesAttributes(absent, other));
  });

  it("matches nothing at all against a message with no attributes", () => {
    // Given a policy asking for an attribute to be missing.
    const absent = { type: [{ exists: false }] };

    // When a message carrying no attributes at all is matched.
    // Then it does not match, which is what real SNS states: an empty set of
    // attributes matches no filter policy, including this one.
    assertFalse(simSnsFilterMatchesAttributes(absent, {}));
  });

  it("matches nothing at all when the attribute is missing", () => {
    // Given policies of every other operator.
    const policies = [
      { type: ["order"] },
      { type: [{ prefix: "order" }] },
      { type: [{ suffix: "order" }] },
      { type: [{ "equals-ignore-case": "order" }] },
      { type: [{ "anything-but": "order" }] },
      { type: [{ numeric: [">", 0] }] },
    ];

    // When a message carrying no such attribute is matched against each.
    // Then none of them matches, including the one excluding a value: there is
    // no value there to be anything but the excluded one.
    for (const policy of policies) {
      assertFalse(simSnsFilterMatchesAttributes(policy, {}));
    }
  });
});
