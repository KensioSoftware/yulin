import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsFilterMatchesAttributes,
  simSnsNumberAttribute,
  simSnsStringAttribute,
} from "../../../../test/sns/filter-fixture.js";
import type { JSONObject } from "../../../util/type-guard/json.js";

/**
 * Whether a policy matches a message carrying one `amount` number.
 */
function matchesAmount(policy: JSONObject, amount: string): boolean {
  return simSnsFilterMatchesAttributes(policy, {
    amount: simSnsNumberAttribute(amount),
  });
}

describe("SNS filter policy numeric matching", () => {
  it("compares a number with each comparator", () => {
    // Given a policy for each numeric comparator.
    const cases = [
      { policy: { amount: [{ numeric: ["=", 100] }] }, yes: "100", no: "101" },
      { policy: { amount: [{ numeric: [">", 100] }] }, yes: "150", no: "100" },
      { policy: { amount: [{ numeric: [">=", 100] }] }, yes: "100", no: "99" },
      { policy: { amount: [{ numeric: ["<", 100] }] }, yes: "50", no: "100" },
      { policy: { amount: [{ numeric: ["<=", 100] }] }, yes: "100", no: "101" },
    ];

    // When an amount on each side of the comparison is matched against it.
    // Then each holds only for the side it names.
    for (const { policy, yes, no } of cases) {
      assertTrue(matchesAmount(policy, yes));
      assertFalse(matchesAmount(policy, no));
    }
  });

  it("matches only inside a range", () => {
    // Given a policy for an amount over 0 and up to 100.
    const policy = { amount: [{ numeric: [">", 0, "<=", 100] }] };

    // When amounts on either side of it are matched.
    // Then only the ones inside it match, and the upper end is included.
    assertFalse(matchesAmount(policy, "0"));
    assertTrue(matchesAmount(policy, "50"));
    assertTrue(matchesAmount(policy, "100"));
    assertFalse(matchesAmount(policy, "101"));
  });

  it("matches a number written differently", () => {
    // Given a policy about an exact amount.
    const policy = { amount: [{ numeric: ["=", 100] }] };

    // When the same number is published in other spellings.
    // Then each matches, since the attribute is compared as the number it
    // means rather than as the digits it carries.
    assertTrue(matchesAmount(policy, "100.0"));
    assertTrue(matchesAmount(policy, "1e2"));
  });

  it("compares numerically only what is a number", () => {
    // Given a numeric policy.
    const policy = { amount: [{ numeric: [">", 100] }] };

    // When a String attribute holding digits, and a Number attribute holding
    // something else, are matched.
    const asString = simSnsFilterMatchesAttributes(policy, {
      amount: simSnsStringAttribute("150"),
    });

    // Then neither matches. Real SNS matches numerically on the Number data
    // type, so digits published as a String are text.
    assertFalse(asString);
    assertFalse(matchesAmount(policy, "a lot"));
  });

  it("matches a number the policy names on its own", () => {
    // Given a policy naming a number rather than an operator.
    const policy = { amount: [100] };

    // When the number and its text are matched.
    // Then the Number attribute matches and the String one does not.
    assertTrue(matchesAmount(policy, "100"));
    assertFalse(
      simSnsFilterMatchesAttributes(policy, {
        amount: simSnsStringAttribute("100"),
      }),
    );
  });

  it("matches either side of an or across separate keys", () => {
    // Given a policy matching one key or another.
    const policy = {
      $or: [{ type: ["order"] }, { tenant: ["acme"] }],
    };

    // When messages carrying one, the other and neither are matched.
    // Then either side is enough, which separate keys of a policy are not.
    assertTrue(
      simSnsFilterMatchesAttributes(policy, {
        type: simSnsStringAttribute("order"),
      }),
    );
    assertTrue(
      simSnsFilterMatchesAttributes(policy, {
        tenant: simSnsStringAttribute("acme"),
      }),
    );
    assertFalse(
      simSnsFilterMatchesAttributes(policy, {
        type: simSnsStringAttribute("refund"),
      }),
    );
  });

  it("matches any member of a String.Array attribute", () => {
    // Given a policy naming one region.
    const policy = { regions: ["eu-west-2"] };

    // When an attribute holding a list of regions is matched.
    const listed = simSnsFilterMatchesAttributes(policy, {
      regions: {
        DataType: "String.Array",
        StringValue: JSON.stringify(["us-east-1", "eu-west-2"]),
      },
    });
    const other = simSnsFilterMatchesAttributes(policy, {
      regions: {
        DataType: "String.Array",
        StringValue: JSON.stringify(["us-east-1"]),
      },
    });

    // Then any member matching is the attribute matching.
    assertTrue(listed);
    assertFalse(other);
  });

  it("matches the text of a String.Array that is not a list", () => {
    // Given a policy naming a value.
    const policy = { regions: ["eu-west-2"] };

    // When a String.Array attribute carrying something other than a JSON list
    // is matched.
    const plain = simSnsFilterMatchesAttributes(policy, {
      regions: { DataType: "String.Array", StringValue: "eu-west-2" },
    });
    const number = simSnsFilterMatchesAttributes(policy, {
      regions: { DataType: "String.Array", StringValue: "2" },
    });

    // Then it is matched as the text it is. A publish does not check that the
    // value is a JSON list, so a filter policy is not the place to start.
    assertTrue(plain);
    assertFalse(number);
  });

  it("matches nothing against a binary attribute", () => {
    // Given a policy about an attribute carrying bytes.
    const receipt = {
      receipt: { DataType: "Binary", BinaryValue: Uint8Array.from([1, 2, 3]) },
    };

    // When policies about it are matched.
    // Then it is a key with no value to match, since real SNS filters on text.
    // The message still carries an attribute, so a policy about a key that is
    // missing has something to be missing from.
    assertFalse(
      simSnsFilterMatchesAttributes({ receipt: [{ prefix: "" }] }, receipt),
    );
    assertTrue(
      simSnsFilterMatchesAttributes({ receipt: [{ exists: false }] }, receipt),
    );
  });
});
