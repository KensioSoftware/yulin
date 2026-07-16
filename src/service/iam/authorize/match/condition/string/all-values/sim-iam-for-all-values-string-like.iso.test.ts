import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM ForAllValues:StringLike authorization", () => {
  it("allows a request when every context value matches a policy pattern", () => {
    // Given a policy accepting app and team tag-key patterns.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringLike": {
              "aws:TagKeys": ["application:*", "team-?"],
            },
          },
        },
      },
    });

    // When every supplied tag key matches one of the patterns.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["application:name", "team-a"],
      },
      resourcePolicies: [policy],
    });

    // Then the policy allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when a scalar context value matches a policy pattern", () => {
    // Given a policy accepting tag keys beginning with "application:".
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringLike": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When the request supplies one matching tag key as a scalar value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": "application:name",
      },
      resourcePolicies: [policy],
    });

    // Then the matching value satisfies the condition.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when any context value matches no pattern", () => {
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
            "ForAllValues:StringLike": {
              "aws:TagKeys": ["application:*", "team-*"],
            },
          },
        },
      },
    });

    // When one supplied tag key matches none of the patterns.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["application:name", "environment"],
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches every context value case-sensitively", () => {
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
            "ForAllValues:StringLike": {
              "aws:TagKeys": "application:*",
            },
          },
        },
      },
    });

    // When one supplied tag key uses different casing.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      conditionContext: {
        "aws:TagKeys": ["application:name", "Application:owner"],
      },
      resourcePolicies: [policy],
    });

    // Then the differently cased value prevents the condition from matching.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request when the required context key is absent", () => {
    // Given a policy requiring every tag key to match an app pattern.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringLike": {
              "aws:TagKeys": "application:*",
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

    // Then the incomplete context does not allow the request.
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
            "ForAllValues:StringLike": {
              "aws:PrincipalArn":
                "arn:aws:iam::123456789012:role/application/*",
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

    // Then the caller-derived principal ARN matches the policy pattern.
    assertTrue(decision.isAllowed);
  });
});
