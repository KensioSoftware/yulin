import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM ForAnyValue:StringLike authorization", () => {
  it("allows a request when one context value matches an asterisk pattern", () => {
    // Given a policy accepting app tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When one of several supplied tag keys matches the pattern.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["owner", "application:name", "environment"],
      },
      resourcePolicies: [policy],
    });

    // Then the single matching value allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when one context value matches a question-mark pattern", () => {
    // Given a policy accepting team tag keys with one-character identifiers.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": "team-?",
            },
          },
        },
      },
    });

    // When one supplied tag key has exactly one character after the prefix.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["team-long", "team-a"],
      },
      resourcePolicies: [policy],
    });

    // Then the question-mark match allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when one value matches one of several policy patterns", () => {
    // Given a policy containing several acceptable tag-key patterns.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": ["application:*", "team-?", "cost-*"],
            },
          },
        },
      },
    });

    // When a later context value matches a later policy pattern.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["environment", "cost-centre"],
      },
      resourcePolicies: [policy],
    });

    // Then a match anywhere across the two value sets allows the request.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when no context value matches a policy pattern", () => {
    // Given a policy accepting only app and team tag-key patterns.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": ["application:*", "team-?"],
            },
          },
        },
      },
    });

    // When none of the supplied tag keys matches either pattern.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["environment", "team-long", "cost-centre"],
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches values case-sensitively", () => {
    // Given a policy pattern using lowercase text.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When every supplied variation uses different casing.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["Application:name", "APPLICATION:owner"],
      },
      resourcePolicies: [policy],
    });

    // Then no differently cased value satisfies the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request with an empty context value set", () => {
    // Given a policy accepting app tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When the request supplies the context key with no values.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": [],
      },
      resourcePolicies: [policy],
    });

    // Then there is no value that can satisfy the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request when the required context key is absent", () => {
    // Given a policy requiring any tag key to match an accepted pattern.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:TagKeys": ["application:*", "team-*"],
            },
          },
        },
      },
    });

    // When authorization omits the required tag-key context.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      resourcePolicies: [policy],
    });

    // Then the absent context value does not satisfy the condition.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches a pattern against the principal ARN derived from the caller", () => {
    // Given a policy accepting app roles from a particular account.
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
            "ForAnyValue:StringLike": {
              "aws:PrincipalArn": [
                "arn:aws:iam::210987654321:role/*",
                "arn:aws:iam::123456789012:role/application/*",
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

    // Then the caller-derived principal ARN matches one policy pattern.
    assertTrue(decision.isAllowed);
  });
});
