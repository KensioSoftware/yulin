import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";

describe("Sim IAM authorization caller", () => {
  it("allows an omitted caller as the current account root", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("implicitly denies an anonymous caller without a resource-policy allow", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayEmpty(decision.allowStatements);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("allows an anonymous caller through a wildcard resource policy", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/public/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/public/*",
            },
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("does not match the account root principal for an anonymous caller", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "arn:aws:iam::123456789012:root",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isImplicitDeny);
    assertArrayEmpty(decision.allowStatements);
  });

  it("applies an explicit resource-policy deny to an anonymous caller", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/private/example-key.txt",
      caller: {
        kind: "anonymous",
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/*",
              },
              {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/private/*",
              },
            ],
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.isExplicitDeny);
    assertTrue(decision.isDenied);
    assertFalse(decision.isAllowed);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });

  it("allows an explicitly supplied account root principal", () => {
    const simAws = new SimAws();
    const account = simAws.account("123456789012");

    const decision = account.iam().authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: account.rootPrincipal,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertTrue(decision.isAllowed);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("does not give another account root implicit access", () => {
    const simAws = new SimAws();
    const resourceAccount = simAws.account("123456789012");
    const callerAccount = simAws.account("210987654321");

    const decision = resourceAccount.iam().authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: callerAccount.rootPrincipal,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertArrayEmpty(decision.allowStatements);
    assertArrayEmpty(decision.explicitDenyStatements);
  });
});
