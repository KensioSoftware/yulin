import { CreatePolicyCommand, ListPoliciesCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";

describe("IAM ListPoliciesCommand", () => {
  it("lists IAM Policies through the top-level SimIam service", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const readPolicyOutput = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadPolicy",
        Path: "/service-role/",
        Description: "Allows reads",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    const writePolicyOutput = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "WritePolicy",
        Path: "/application/",
        Description: "Allows writes",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:PutObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    const listPoliciesOutput = await simIam.listPolicies(
      new ListPoliciesCommand(),
    );

    assertArrayLength(listPoliciesOutput.Policies, 2);
    assertFalse(listPoliciesOutput.IsTruncated);
    assertUndefined(listPoliciesOutput.Marker);

    const listedPolicyNames = listPoliciesOutput.Policies.map(
      (policy) => policy.PolicyName,
    ).toSorted();

    assertIdentical(listedPolicyNames[0], "ReadPolicy");
    assertIdentical(listedPolicyNames[1], "WritePolicy");

    const readPolicy = listPoliciesOutput.Policies.find(
      (policy) => policy.PolicyName === "ReadPolicy",
    );
    assertNonNullable(readPolicy);
    assertIdentical(readPolicy.Arn, readPolicyOutput.Policy.Arn);
    assertIdentical(readPolicy.PolicyId, readPolicyOutput.Policy.PolicyId);
    assertIdentical(readPolicy.Path, "/service-role/");
    assertIdentical(readPolicy.DefaultVersionId, "v1");
    assertIdentical(readPolicy.AttachmentCount, 0);
    assertIdentical(readPolicy.PermissionsBoundaryUsageCount, 0);
    assertTrue(readPolicy.IsAttachable);
    assertIdentical(readPolicy.Description, "Allows reads");
    assertNonNullable(readPolicy.CreateDate);
    assertNonNullable(readPolicy.UpdateDate);

    const writePolicy = listPoliciesOutput.Policies.find(
      (policy) => policy.PolicyName === "WritePolicy",
    );
    assertNonNullable(writePolicy);
    assertIdentical(writePolicy.Arn, writePolicyOutput.Policy.Arn);
    assertIdentical(writePolicy.PolicyId, writePolicyOutput.Policy.PolicyId);
  });

  it("filters IAM Policies by path prefix", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ServiceRolePolicy",
        Path: "/service-role/",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ApplicationPolicy",
        Path: "/application/",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    const listPoliciesOutput = await simIam.listPolicies(
      new ListPoliciesCommand({
        PathPrefix: "/service-role/",
      }),
    );

    assertArrayLength(listPoliciesOutput.Policies, 1);
    assertIdentical(
      listPoliciesOutput.Policies[0].PolicyName,
      "ServiceRolePolicy",
    );
    assertIdentical(listPoliciesOutput.Policies[0].Path, "/service-role/");
    assertFalse(listPoliciesOutput.IsTruncated);
    assertUndefined(listPoliciesOutput.Marker);
  });

  it("returns no policies for the AWS scope", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "LocalPolicy",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    const listPoliciesOutput = await simIam.listPolicies(
      new ListPoliciesCommand({
        Scope: "AWS",
      }),
    );

    assertArrayLength(listPoliciesOutput.Policies, 0);
    assertFalse(listPoliciesOutput.IsTruncated);
    assertUndefined(listPoliciesOutput.Marker);
  });

  it("paginates IAM Policies with markers", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "AlphaPolicy",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "BetaPolicy",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );
    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "GammaPolicy",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    const firstPage = await simIam.listPolicies(
      new ListPoliciesCommand({
        MaxItems: 2,
      }),
    );

    assertArrayLength(firstPage.Policies, 2);
    assertTrue(firstPage.IsTruncated);
    assertNonNullable(firstPage.Marker);

    const firstPagePolicyNames = firstPage.Policies.map(
      (policy) => policy.PolicyName,
    );

    const secondPage = await simIam.listPolicies(
      new ListPoliciesCommand({
        Marker: firstPage.Marker,
        MaxItems: 2,
      }),
    );

    assertArrayLength(secondPage.Policies, 1);
    assertFalse(secondPage.IsTruncated);
    assertUndefined(secondPage.Marker);

    const allPolicyNames = [
      ...firstPagePolicyNames,
      ...secondPage.Policies.map((policy) => policy.PolicyName),
    ].toSorted();

    assertIdentical(allPolicyNames[0], "AlphaPolicy");
    assertIdentical(allPolicyNames[1], "BetaPolicy");
    assertIdentical(allPolicyNames[2], "GammaPolicy");
  });

  it("excludes unattached and permissions policies when requested", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "UnattachedPolicy",
        PolicyDocument: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    const onlyAttachedOutput = await simIam.listPolicies(
      new ListPoliciesCommand({
        OnlyAttached: true,
      }),
    );
    const permissionsBoundaryOutput = await simIam.listPolicies(
      new ListPoliciesCommand({
        PolicyUsageFilter: "PermissionsBoundary",
      }),
    );

    assertArrayLength(onlyAttachedOutput.Policies, 0);
    assertFalse(onlyAttachedOutput.IsTruncated);
    assertArrayLength(permissionsBoundaryOutput.Policies, 0);
    assertFalse(permissionsBoundaryOutput.IsTruncated);
  });
});
