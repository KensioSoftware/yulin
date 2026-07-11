import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SIM_AWS_ANONYMOUS_CALLER } from "../../../../../../aws/caller/sim-aws-caller.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM ForAnyValue:StringEquals authorization", () => {
  it("allows a request when one of several context values equals the policy value", () => {
    // Given a policy accepting the classification tag key.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": "classification",
            },
          },
        },
      },
    });

    // When one supplied tag key equals the accepted value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["owner", "classification", "environment"],
      },
      resourcePolicies: [policy],
    });

    // Then the single matching context value allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when one context value equals one of several policy values", () => {
    // Given a policy containing several acceptable tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": ["classification", "owner", "cost-centre"],
            },
          },
        },
      },
    });

    // When a later context value matches a later policy value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["environment", "cost-centre"],
      },
      resourcePolicies: [policy],
    });

    // Then a match anywhere across the two value sets allows the request.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when no context value equals a policy value", () => {
    // Given a policy containing several acceptable tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When none of the supplied tag keys equals an accepted value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["environment", "cost-centre"],
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("compares values case-sensitively", () => {
    // Given a policy accepting a lowercase tag key.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": "classification",
            },
          },
        },
      },
    });

    // When every supplied variation uses different casing.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["Classification", "CLASSIFICATION"],
      },
      resourcePolicies: [policy],
    });

    // Then no differently cased value satisfies the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("treats wildcard characters as literal text", () => {
    // Given a StringEquals policy value containing an asterisk.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When a supplied value would match only if the asterisk were a wildcard.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["application:name", "application:owner"],
      },
      resourcePolicies: [policy],
    });

    // Then StringEquals does not treat the asterisk as a wildcard.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request with an empty context value set", () => {
    // Given a policy accepting one of two tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When the request supplies the context key with no values.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": [],
      },
      resourcePolicies: [policy],
    });

    // Then there is no value that can satisfy the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request when the required context key is absent", () => {
    // Given a policy requiring any supplied tag key to equal an accepted value.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When authorization omits the required tag-key context.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      resourcePolicies: [policy],
    });

    // Then the absent context value does not satisfy the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches the principal ARN derived from the caller", () => {
    // Given a policy accepting the caller ARN among several principal values.
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
            "ForAnyValue:StringEquals": {
              "aws:PrincipalArn": [
                "arn:aws:iam::123456789012:role/OtherRole",
                callerPrincipalArn,
              ],
            },
          },
        },
      },
    });

    // When authorization identifies the caller without explicit condition context.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: callerPrincipalArn },
      resourcePolicies: [policy],
    });

    // Then the caller-derived principal ARN satisfies the condition.
    assertTrue(decision.isAllowed);
  });
});
