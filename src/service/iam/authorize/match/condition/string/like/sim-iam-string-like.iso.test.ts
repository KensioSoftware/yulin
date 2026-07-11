import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SIM_AWS_ANONYMOUS_CALLER } from "../../../../../../aws/caller/sim-aws-caller.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM StringLike authorization", () => {
  it("allows a request when the context value matches an asterisk wildcard", () => {
    // Given a policy accepting classification values beginning with "pub".
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: "pub*",
            },
          },
        },
      },
    });

    // When authorization uses a value matched by the wildcard.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        ["s3:ExistingObjectTag/classification"]: "public",
      },
      resourcePolicies: [policy],
    });

    // Then the matching policy allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when the context value matches a question-mark wildcard", () => {
    // Given a policy accepting one character between "publi" and "ly".
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: "publi?ly",
            },
          },
        },
      },
    });

    // When authorization uses a value matched by the single-character wildcard.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        ["s3:ExistingObjectTag/classification"]: "publicly",
      },
      resourcePolicies: [policy],
    });

    // Then the matching policy allows the request.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when the context value does not match", () => {
    // Given a policy accepting only classification values beginning with "pub".
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: "pub*",
            },
          },
        },
      },
    });

    // When authorization uses a value outside the accepted pattern.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        ["s3:ExistingObjectTag/classification"]: "private",
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches StringLike values case-sensitively", () => {
    // Given a policy whose wildcard pattern uses lowercase text.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: "pub*",
            },
          },
        },
      },
    });

    // When authorization uses matching text with different casing.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        ["s3:ExistingObjectTag/classification"]: "Public",
      },
      resourcePolicies: [policy],
    });

    // Then the case-sensitive condition does not allow the request.
    assertTrue(decision.isImplicitDeny);
  });

  it("allows a request when the context value matches any policy pattern", () => {
    // Given a policy containing multiple acceptable StringLike patterns.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: ["internal-*", "pub*"],
            },
          },
        },
      },
    });

    // When authorization uses a value matching one of the patterns.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        ["s3:ExistingObjectTag/classification"]: "public",
      },
      resourcePolicies: [policy],
    });

    // Then the matching pattern allows the request.
    assertTrue(decision.isAllowed);
  });

  it("matches a pattern against the principal ARN supplied by IAM", () => {
    // Given a policy accepting role principals from a particular account.
    const simIam = new SimIam();
    const callerPrincipalArn =
      "arn:aws:iam::123456789012:role/application/TestRole";
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              "aws:PrincipalArn":
                "arn:aws:iam::123456789012:role/application/*",
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

    // Then StringLike matches the principal ARN derived by sim IAM.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when the required context key is absent", () => {
    // Given a policy requiring a StringLike condition context value.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            StringLike: {
              ["s3:ExistingObjectTag/classification"]: "pub*",
            },
          },
        },
      },
    });

    // When authorization omits the required condition context key.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      resourcePolicies: [policy],
    });

    // Then the incomplete condition context does not allow the request.
    assertTrue(decision.isImplicitDeny);
  });
});
