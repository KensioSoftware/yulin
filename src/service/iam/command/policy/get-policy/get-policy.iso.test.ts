import { CreatePolicyCommand, GetPolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

describe("IAM GetPolicyCommand", () => {
  it("gets an IAM Policy through the top-level SimIam service", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "TestPolicy",
        Path: "/service-role/",
        Description: "Policy used by GetPolicyCommand tests",
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

    assertNonNullable(
      policyCreation.Policy.Arn,
      "Policy ARN should be defined",
    );

    const policyOut = await simIam.getPolicy(
      new GetPolicyCommand({
        PolicyArn: policyCreation.Policy.Arn,
      }),
    );

    assertIdentical(policyOut.Policy.PolicyName, "TestPolicy");
    assertIdentical(policyOut.Policy.Arn, policyCreation.Policy.Arn);
    assertIdentical(policyOut.Policy.Path, "/service-role/");
    assertIdentical(policyOut.Policy.DefaultVersionId, "v1");
    assertIdentical(policyOut.Policy.AttachmentCount, 0);
    assertIdentical(policyOut.Policy.PermissionsBoundaryUsageCount, 0);
    assertTrue(policyOut.Policy.IsAttachable);
    assertIdentical(
      policyOut.Policy.Description,
      "Policy used by GetPolicyCommand tests",
    );
    assertIdentical(policyOut.Policy.PolicyId, policyCreation.Policy.PolicyId);
    assertNonNullable(policyOut.Policy.CreateDate);
    assertNonNullable(policyOut.Policy.UpdateDate);
  });

  it("throws on undefined Policy ARN", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await assertThrowsErrorAsync(async () =>
      simIam.getPolicy(
        new GetPolicyCommand({
          PolicyArn: undefined,
        }),
      ),
    );
  });

  it("throws on getting a non-existent IAM Policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.getPolicy(
        new GetPolicyCommand({
          PolicyArn: "arn:aws:iam::123456789012:policy/MissingPolicy",
        }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
  });
});
