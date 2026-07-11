import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SIM_AWS_ANONYMOUS_CALLER } from "../../../../../../aws/caller/sim-aws-caller.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";

describe("sim IAM ForAllValues:StringEquals authorization", () => {
  it("allows a request when every context value equals a policy value", () => {
    // Given a policy accepting either of two tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When the policy accepts every supplied tag key.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["owner", "classification"],
      },
      resourcePolicies: [policy],
    });

    // Then the policy allows the request.
    assertTrue(decision.isAllowed);
  });

  it("allows a request when a scalar context value equals a policy value", () => {
    // Given a policy accepting multiple possible tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When the request supplies one accepted tag key as a scalar value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": "classification",
      },
      resourcePolicies: [policy],
    });

    // Then the single matching value satisfies the condition.
    assertTrue(decision.isAllowed);
  });

  it("implicitly denies a request when any context value is not accepted", () => {
    // Given a policy accepting only classification and owner tag keys.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
              "aws:TagKeys": ["classification", "owner"],
            },
          },
        },
      },
    });

    // When one supplied tag key is outside the accepted values.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["classification", "environment"],
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("compares every context value case-sensitively", () => {
    // Given a policy whose accepted tag key uses lowercase text.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
              "aws:TagKeys": "classification",
            },
          },
        },
      },
    });

    // When the request supplies the tag key with different casing.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": ["classification", "Classification"],
      },
      resourcePolicies: [policy],
    });

    // Then the differently cased value prevents the condition from matching.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies a request when the required context key is absent", () => {
    // Given a policy requiring all supplied tag keys to be accepted.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
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

    // Then the incomplete context does not allow the request.
    assertTrue(decision.isImplicitDeny);
  });

  it("matches the principal ARN derived from the caller", () => {
    // Given a policy accepting the caller ARN as one of its principal values.
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
            "ForAllValues:StringEquals": {
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

  it.each([
    {
      name: "context values",
      expectedValues: ["classification"],
      actualValues: [],
    },
    {
      name: "policy values",
      expectedValues: [],
      actualValues: ["classification"],
    },
  ])(
    "implicitly denies a request when $name are empty",
    ({ expectedValues, actualValues }) => {
      // Given a policy using the supplied accepted tag-key values.
      const simIam = new SimIam();
      const policy = simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:PutObjectTagging",
            Resource: "arn:aws:s3:::example-bucket/example-key.txt",
            Condition: {
              "ForAllValues:StringEquals": {
                "aws:TagKeys": expectedValues,
              },
            },
          },
        },
      });

      // When either side of the condition comparison is empty.
      const decision = simIam.authorize({
        action: "s3:PutObjectTagging",
        resource: "arn:aws:s3:::example-bucket/example-key.txt",
        caller: SIM_AWS_ANONYMOUS_CALLER,
        conditionContext: {
          "aws:TagKeys": actualValues,
        },
        resourcePolicies: [policy],
      });

      // Then the empty values do not satisfy the condition.
      assertTrue(decision.isImplicitDeny);
    },
  );

  it("implicitly denies a request with a non-string context value", () => {
    // Given a policy requiring an accepted string tag key.
    const simIam = new SimIam();
    const policy = simIamAuthZResourcePolicySourceFactory.make({
      document: {
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:PutObjectTagging",
          Resource: "arn:aws:s3:::example-bucket/example-key.txt",
          Condition: {
            "ForAllValues:StringEquals": {
              "aws:TagKeys": "classification",
            },
          },
        },
      },
    });

    // When the condition context supplies a non-string scalar value.
    const decision = simIam.authorize({
      action: "s3:PutObjectTagging",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "aws:TagKeys": 42,
      },
      resourcePolicies: [policy],
    });

    // Then the invalid string condition value does not match.
    assertTrue(decision.isImplicitDeny);
  });
});
