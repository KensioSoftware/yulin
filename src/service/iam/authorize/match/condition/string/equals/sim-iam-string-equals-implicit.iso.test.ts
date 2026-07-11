import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import { SimIam } from "../../../../../sim-iam.js";
import { SIM_AWS_ANONYMOUS_CALLER } from "../../../../../../aws/caller/sim-aws-caller.js";

describe("sim IAM StringEquals authorization", () => {
  it("implicitly denies a request when the context value differs", () => {
    // Given a policy requiring a particular StringEquals context value.
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

    // When authorization uses a non-matching context value.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "s3:ExistingObjectTag/classification": "private",
      },
      resourcePolicies: [policy],
    });

    // Then the allow statement does not match.
    assertTrue(decision.isImplicitDeny);
  });

  it("implicitly denies an array-valued request context", () => {
    // Given a StringEquals policy requiring a scalar value.
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

    // When the request supplies the matching value inside an array.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: SIM_AWS_ANONYMOUS_CALLER,
      conditionContext: {
        "s3:ExistingObjectTag/classification": ["public"],
      },
      resourcePolicies: [policy],
    });

    // Then the unqualified scalar operator does not accept the request value.
    assertTrue(decision.isImplicitDeny);
  });
});
