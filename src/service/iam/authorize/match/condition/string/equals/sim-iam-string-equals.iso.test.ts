import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM StringEquals authorization", () => {
  it("allows a request when the context value exactly equals the policy value", () => {
    // Given a policy requiring an exact StringEquals context value.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "s3:ExistingObjectTag/classification": "public",
            },
          },
        },
      },
    });

    // When authorization uses the required context value.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "s3:ExistingObjectTag/classification": "public",
      },
      resourcePolicies: [policy],
    });

    // Then the matching policy allows the request.
    assertTrue(decision.isAllowed);
  });

  it("compares StringEquals values case-sensitively", () => {
    // Given a policy whose StringEquals value uses lowercase text.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "s3:ExistingObjectTag/classification": "public",
            },
          },
        },
      },
    });

    // When authorization uses the same text with different casing.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "s3:ExistingObjectTag/classification": "Public",
      },
      resourcePolicies: [policy],
    });

    // Then the differently cased value is not accepted.
    assertFalse(decision.isAllowed);
  });

  it("allows a request when the context value equals any policy value", () => {
    // Given a StringEquals policy containing multiple acceptable values.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "s3:ExistingObjectTag/classification": ["internal", "public"],
            },
          },
        },
      },
    });

    // When authorization uses one of the acceptable values.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "s3:ExistingObjectTag/classification": "public",
      },
      resourcePolicies: [policy],
    });

    // Then the matching value allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a specified principal when its context value matches", () => {
    // Given a resource policy for a specific principal with a StringEquals condition.
    const simIam = new SimIam();
    const callerPrincipalArn = "arn:aws:iam::123456789012:role/TestRole";
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: callerPrincipalArn,
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "s3:ExistingObjectTag/classification": "public",
            },
          },
        },
      },
    });

    // When that principal authorizes with the matching context value.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: callerPrincipalArn },
      conditionContext: {
        "s3:ExistingObjectTag/classification": "public",
      },
      resourcePolicies: [policy],
    });

    // Then the resource policy allows the specified principal.
    assertTrue(decision.isAllowed);
  });

  it("supplies the principal ARN condition value from the caller", () => {
    // Given a policy conditioned on an IAM-known property of the principal.
    const simIam = new SimIam();
    const callerPrincipalArn = "arn:aws:iam::123456789012:role/TestRole";
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "aws:PrincipalArn": callerPrincipalArn,
            },
          },
        },
      },
    });

    // When authorization identifies the caller without supplying condition context.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: callerPrincipalArn },
      resourcePolicies: [policy],
    });

    // Then sim IAM derives the principal condition value and allows the request.
    assertTrue(decision.isAllowed);
  });

  it("matches StringEquals condition keys case-insensitively", () => {
    // Given a policy whose condition key uses mixed casing.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "S3:ExistingObjectTag/Classification": "public",
            },
          },
        },
      },
    });

    // When authorization supplies the same condition key with different casing.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "s3:existingobjecttag/classification": "public",
      },
      resourcePolicies: [policy],
    });

    // Then the differently cased condition key still matches.
    assertTrue(decision.isAllowed);
  });

  it("requires every key in a StringEquals condition to match", () => {
    // Given a policy requiring two StringEquals context keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringEquals: {
              "s3:ExistingObjectTag/classification": "public",
              "aws:RequestedRegion": "eu-west-2",
            },
          },
        },
      },
    });

    // When authorization supplies only one of the required context keys.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "s3:ExistingObjectTag/classification": "public",
      },
      resourcePolicies: [policy],
    });

    // Then the incomplete condition context does not allow the request.
    assertTrue(decision.isImplicitDeny);
  });
});
