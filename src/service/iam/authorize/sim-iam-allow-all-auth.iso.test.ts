import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamAllowAllAuth } from "./sim-iam-inter-service-auth-z.js";

describe("SimIamAllowAllAuth", () => {
  it("allows an omitted caller without IAM policy evaluation", () => {
    // Given a permissive authorization implementation with no Account context.
    const auth = new SimIamAllowAllAuth();

    // When an operation is authorized without a caller.
    const decision = auth.authorize({
      action: "s3:ListAllMyBuckets",
      resource: "*",
    });

    // Then the request is unconditionally allowed and has diagnostic caller
    // data.
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertIdentical(decision.caller.principal.kind, "anonymous");
  });

  it("allows an explicit anonymous caller", () => {
    // Given a permissive authorization implementation.
    const auth = new SimIamAllowAllAuth();

    // When an explicitly anonymous caller requests an operation.
    const decision = auth.authorize({
      action: "s3:PutBucketWebsite",
      resource: "arn:aws:s3:::example-bucket",
      caller: { kind: "anonymous" },
    });

    // Then anonymity cannot cause a denial in the allow-all implementation.
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertIdentical(decision.caller.principal.kind, "anonymous");
  });

  it("preserves resolved metadata for an ARN caller", () => {
    // Given a permissive authorization implementation and an IAM Role caller.
    const auth = new SimIamAllowAllAuth();
    const roleArn = "arn:aws:iam::123456789012:role/ExampleRole";

    // When the Role requests an operation.
    const decision = auth.authorize({
      action: "s3:CreateBucket",
      resource: "arn:aws:s3:::example-bucket",
      caller: {
        kind: "arn",
        arn: roleArn,
      },
    });

    // Then the decision remains allowed and retains useful caller diagnostics.
    assertTrue(decision.isAllowed);
    assertIdentical(decision.caller.arn, roleArn);
    assertIdentical(decision.caller.accountId, "123456789012");
  });
});
