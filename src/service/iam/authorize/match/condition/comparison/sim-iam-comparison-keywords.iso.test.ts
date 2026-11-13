import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";

const reportObject = "arn:aws:s3:::reports-bucket/summary.csv";

/**
 * Whether a resource policy allowing a read on one condition allows it, with
 * the request context supplied alongside.
 */
function allowed(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): boolean {
  return new SimIam().authorize({
    action: "s3:GetObject",
    resource: reportObject,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: reportObject,
            Condition: condition,
          },
        },
      }),
    ],
  }).isAllowed;
}

describe("sim IAM IP address condition operators", () => {
  it("matches an IPv4 address inside a CIDR range", () => {
    // Given a read allowed from one /24
    const condition = { IpAddress: { "aws:SourceIp": "203.0.113.0/24" } };

    // When requests arrive from inside and outside it
    // Then only the address inside matches
    assertTrue(allowed(condition, { "aws:SourceIp": "203.0.113.7" }));
    assertFalse(allowed(condition, { "aws:SourceIp": "198.51.100.7" }));
  });

  it("reads an address with no prefix as a range of one", () => {
    // Given a read allowed from one address
    const condition = { IpAddress: { "aws:SourceIp": "203.0.113.7" } };

    // When the neighbouring address asks
    // Then the default /32 leaves it out
    assertTrue(allowed(condition, { "aws:SourceIp": "203.0.113.7" }));
    assertFalse(allowed(condition, { "aws:SourceIp": "203.0.113.8" }));
  });

  it("matches an IPv6 address against a mixed list of ranges", () => {
    // Given a read allowed from an IPv4 and an IPv6 range
    const condition = {
      IpAddress: {
        "aws:SourceIp": ["203.0.113.0/24", "2001:DB8:1234:5678::/64"],
      },
    };

    // When an address from the IPv6 range asks
    // Then the IPv6 range covers it
    assertTrue(allowed(condition, { "aws:SourceIp": "2001:db8:1234:5678::1" }));
  });

  it("keeps IPv4 addresses out of IPv6 ranges", () => {
    // Given a read allowed from every IPv6 address
    const condition = { IpAddress: { "aws:SourceIp": "::/0" } };

    // When an IPv4 address asks
    // Then the IPv6 range leaves it out
    assertFalse(allowed(condition, { "aws:SourceIp": "203.0.113.7" }));
  });

  it("requires NotIpAddress to fall outside every range", () => {
    // Given a read withheld from two ranges
    const condition = {
      NotIpAddress: { "aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"] },
    };

    // When an address in the second range asks, and then one in neither
    // Then the first is withheld and the second is not
    assertFalse(allowed(condition, { "aws:SourceIp": "198.51.100.7" }));
    assertTrue(allowed(condition, { "aws:SourceIp": "192.0.2.7" }));
  });

  it("refuses a range it cannot read", () => {
    // Given a read withheld from a malformed range
    const condition = { NotIpAddress: { "aws:SourceIp": "203.0.113.0/33" } };

    // When any address asks
    // Then the condition fails rather than reading the range as excluding it
    assertFalse(allowed(condition, { "aws:SourceIp": "192.0.2.7" }));
  });
});

describe("sim IAM BinaryEquals", () => {
  it("compares the bytes two base64 values encode", () => {
    // Given a read allowed for one binary value
    const condition = {
      BinaryEquals: {
        "s3:ExistingObjectTag/digest": "QmluYXJ5VmFsdWVJbkJhc2U2NA==",
      },
    };

    // When the request carries those bytes, and then other bytes
    // Then only the same bytes match
    assertTrue(
      allowed(condition, {
        "s3:ExistingObjectTag/digest": "QmluYXJ5VmFsdWVJbkJhc2U2NA==",
      }),
    );
    assertFalse(allowed(condition, { "s3:ExistingObjectTag/digest": "QUJD" }));
  });

  it("refuses a value that is not base64", () => {
    // Given the same grant
    const condition = {
      BinaryEquals: {
        "s3:ExistingObjectTag/digest": "QmluYXJ5VmFsdWVJbkJhc2U2NA==",
      },
    };

    // When the request carries text that base64 cannot hold
    // Then the condition fails
    assertFalse(
      allowed(condition, { "s3:ExistingObjectTag/digest": "ASIA IOSFODNN7" }),
    );
  });
});

describe("sim IAM IgnoreCase string operators", () => {
  it("matches StringEqualsIgnoreCase whatever the case", () => {
    // Given a read allowed for the preprod environment, written in lower case
    const condition = {
      StringEqualsIgnoreCase: {
        "s3:ExistingObjectTag/environment": ["preprod", "storage"],
      },
    };

    // When the tag value arrives in mixed case, and then a different value
    // Then the case is ignored and the value is not
    assertTrue(
      allowed(condition, { "s3:ExistingObjectTag/environment": "PreProd" }),
    );
    assertFalse(
      allowed(condition, { "s3:ExistingObjectTag/environment": "prod" }),
    );
  });

  it("withholds StringNotEqualsIgnoreCase from every case of a value", () => {
    // Given a read withheld from the secret classification
    const condition = {
      StringNotEqualsIgnoreCase: {
        "s3:ExistingObjectTag/classification": "secret",
      },
    };

    // When the tag value arrives in upper case
    // Then the withheld value still matches it
    assertFalse(
      allowed(condition, { "s3:ExistingObjectTag/classification": "SECRET" }),
    );
  });
});

describe("sim IAM IfExists and set qualifiers on every operator", () => {
  it("matches an IfExists condition when the request carries no value", () => {
    // Given a read allowed for small listings if a page size is given at all
    const condition = {
      NumericLessThanEqualsIfExists: { "s3:max-keys": "10" },
    };

    // When the request gives no page size, then a small one, then a large one
    // Then only the large page size fails the condition
    assertTrue(allowed(condition));
    assertTrue(allowed(condition, { "s3:max-keys": "5" }));
    assertFalse(allowed(condition, { "s3:max-keys": "50" }));
  });

  it("matches ForAnyValue:ArnLike when one request ARN fits", () => {
    // Given a read allowed when one source is a distribution in the Account
    const condition = {
      "ForAnyValue:ArnLike": {
        "aws:SourceArn": "arn:aws:cloudfront::123456789012:distribution/*",
      },
    };

    // When the request carries one such ARN and one from elsewhere
    // Then one fitting ARN is enough
    assertTrue(
      allowed(condition, {
        "aws:SourceArn": [
          "arn:aws:cloudfront::777788889999:distribution/EXAMPLE",
          "arn:aws:cloudfront::123456789012:distribution/EXAMPLE",
        ],
      }),
    );
  });

  it("matches ForAllValues:Bool only when every request value agrees", () => {
    // Given a read allowed when every flag in a set is true
    const condition = { "ForAllValues:Bool": { "s3:flags": "true" } };

    // When every flag is true, and then one is false
    // Then a single false flag fails the condition
    assertTrue(allowed(condition, { "s3:flags": ["true", "TRUE"] }));
    assertFalse(allowed(condition, { "s3:flags": ["true", "false"] }));
  });
});

describe("sim IAM comparisons given values of the wrong kind", () => {
  it.each([
    ["BinaryEquals", "QUJD", 7],
    ["Bool", "true", 1],
    ["DateLessThan", "2027-01-01", true],
    ["NumericLessThan", "10", Infinity],
    ["IpAddress", "203.0.113.0/24", 203],
    ["IpAddress", "203.0.113.0/abc", "203.0.113.7"],
    ["IpAddress", "203.0.113.0/24/8", "203.0.113.7"],
    ["IpAddress", "not-an-address/24", "203.0.113.7"],
    ["IpAddress", "203.0.113.0/24", "not-an-address"],
    ["StringEquals", "7", 7],
  ])(
    "fails %s with policy value %j and request value %j",
    (keyword, policyValue, requestValue) => {
      // Given a read allowed on one condition
      const condition = {
        [keyword]: { "s3:ExistingObjectTag/value": policyValue },
      };

      // When the request carries a value the comparison cannot read
      const isAllowed = allowed(condition, {
        "s3:ExistingObjectTag/value": requestValue,
      });

      // Then the condition fails
      assertFalse(isAllowed);
    },
  );
});
