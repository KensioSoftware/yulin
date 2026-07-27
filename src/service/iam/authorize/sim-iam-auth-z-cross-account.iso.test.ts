import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;
const objectArn = "arn:aws:s3:::reports-bucket/summary.csv";

/**
 * A resource policy on the object granting the other Account's Role.
 */
function grantingResourcePolicy(
  effect: "Allow" | "Deny",
): SimIamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: {
      Effect: effect,
      Principal: { AWS: callerRoleArn },
      Action: "s3:GetObject",
      Resource: objectArn,
    },
  };
}

/**
 * Create the calling Role in its own Account, with an inline policy of the
 * given effect for reading the object.
 */
async function callerRole(
  simAws: SimAws,
  effect: "Allow" | "Deny",
): Promise<void> {
  const iam = simAws.account(callerAccountId).iam();

  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Caller",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Caller",
      PolicyName: "ReadReports",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: effect,
          Action: "s3:GetObject",
          Resource: objectArn,
        },
      }),
    }),
  );
}

/**
 * Authorize the other Account's Role against the resource-owning Account.
 */
function authorizeCaller(
  simAws: SimAws,
  resourcePolicy: SimIamPolicyDocument,
  callerArn: string = callerRoleArn,
): ReturnType<ReturnType<SimAws["iam"]>["authorize"]> {
  return simAws
    .account(ownerAccountId)
    .iam()
    .authorize({
      action: "s3:GetObject",
      resource: objectArn,
      caller: { kind: "arn", arn: callerArn },
      resourcePolicies: [{ document: resourcePolicy }],
    });
}

describe("sim IAM cross-Account authorization", () => {
  it("denies a caller allowed only by the resource policy", () => {
    // Given a resource policy granting a Role in another Account, with nothing
    // in that Account allowing it
    const simAws = new SimAws();
    simAws.account(callerAccountId).iam();

    // When the request is authorized
    const decision = authorizeCaller(simAws, grantingResourcePolicy("Allow"));

    // Then it is implicitly denied: a resource policy delegates to the caller's
    // Account rather than granting on its behalf
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertArrayLength(decision.resourceAllowStatements, 1);
    assertArrayLength(decision.identityAllowStatements, 0);
  });

  it("allows a caller both Accounts allow", async () => {
    // Given the same resource policy, and an identity policy for the Role in
    // its own Account
    const simAws = new SimAws();
    await callerRole(simAws, "Allow");

    // When the request is authorized
    const decision = authorizeCaller(simAws, grantingResourcePolicy("Allow"));

    // Then it is allowed, with a matching Allow from each side, as real AWS
    // requires for a cross-Account request
    assertTrue(decision.isAllowed);
    assertArrayLength(decision.identityAllowStatements, 1);
    assertArrayLength(decision.resourceAllowStatements, 1);
    assertArrayLength(decision.allowStatements, 2);
  });

  it("denies when the resource policy explicitly denies", async () => {
    // Given a Role its own Account allows, denied by the resource policy
    const simAws = new SimAws();
    await callerRole(simAws, "Allow");

    // When the request is authorized
    const decision = authorizeCaller(simAws, grantingResourcePolicy("Deny"));

    // Then the explicit Deny wins, as it does on either side
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });

  it("denies when the caller's own Account explicitly denies", async () => {
    // Given a Role granted by the resource policy, denied by its own Account
    const simAws = new SimAws();
    await callerRole(simAws, "Deny");

    // When the request is authorized
    const decision = authorizeCaller(simAws, grantingResourcePolicy("Allow"));

    // Then the caller's Account denies the request the resource policy invited
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });

  it("denies a caller from an Account the simulation knows nothing about", () => {
    // Given a resource policy granting a principal in an Account that was
    // never created in this simulation
    const simAws = new SimAws();

    // When the request is authorized
    const decision = authorizeCaller(simAws, grantingResourcePolicy("Allow"));

    // Then it is denied: an Account with no IAM state grants nothing, which is
    // what a principal ARN nobody gave permissions to means on AWS
    assertTrue(decision.isImplicitDeny);
  });

  it("allows the other Account's root principal", () => {
    // Given a resource policy granting the whole of another Account
    const simAws = new SimAws();
    simAws.account(callerAccountId).iam();
    const rootArn = `arn:aws:iam::${callerAccountId}:root`;

    // When that Account's root principal calls
    const decision = authorizeCaller(
      simAws,
      {
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: callerAccountId },
          Action: "s3:GetObject",
          Resource: objectArn,
        },
      },
      rootArn,
    );

    // Then it is allowed: the root principal carries its own Account's
    // unrestricted access, so both sides allow the request
    assertTrue(decision.isAllowed);
    assertArrayLength(decision.identityAllowStatements, 1);
  });

  it("allows an anonymous caller on a resource policy alone", () => {
    // Given a resource policy open to anyone
    const simAws = new SimAws();
    const publicPolicy: SimIamPolicyDocument = {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: objectArn,
      },
    };

    // When an anonymous request is authorized
    const decision = simAws
      .account(ownerAccountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: objectArn,
        caller: { kind: "anonymous" },
        resourcePolicies: [{ document: publicPolicy }],
      });

    // Then the resource policy is enough on its own: an anonymous caller has no
    // Account to ask, as on AWS
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
  });

  it("allows a service principal on a resource policy alone", () => {
    // Given a resource policy granting an AWS service
    const simAws = new SimAws();
    const servicePolicy: SimIamPolicyDocument = {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Resource: objectArn,
      },
    };

    // When that service calls
    const decision = simAws
      .account(ownerAccountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: objectArn,
        caller: { kind: "service", service: "cloudfront.amazonaws.com" },
        resourcePolicies: [{ document: servicePolicy }],
      });

    // Then the resource policy is enough on its own: a service principal has no
    // identity policies anywhere
    assertTrue(decision.isAllowed);
  });

  it("leaves same-Account authorization on a resource policy alone", async () => {
    // Given a Role in the resource's own Account, with no identity policies
    const simAws = new SimAws();
    const iam = simAws.account(ownerAccountId).iam();
    const roleCreation = await iam.createRole(
      new CreateRoleCommand({
        RoleName: "OwnAccountReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${ownerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When a resource policy granting it is authorized
    const decision = iam.authorize({
      action: "s3:GetObject",
      resource: objectArn,
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: { AWS: roleCreation.Role.Arn },
              Action: "s3:GetObject",
              Resource: objectArn,
            },
          },
        },
      ],
    });

    // Then either side allowing is still enough within one Account
    assertTrue(decision.isAllowed);
  });
});
