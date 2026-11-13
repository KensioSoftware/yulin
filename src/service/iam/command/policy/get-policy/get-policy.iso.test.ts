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

  it("describes an AWS-managed policy from the catalogue", async () => {
    // Given a simulation that has created no policies.
    const simIam = new SimAws().iam();

    // When it is asked for AWSLambdaBasicExecutionRole.
    const output = await simIam.getPolicy(
      new GetPolicyCommand({
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      }),
    );

    // Then it describes the policy as AWS does.
    assertIdentical(output.Policy.PolicyName, "AWSLambdaBasicExecutionRole");
    assertIdentical(output.Policy.Path, "/service-role/");
    assertIdentical(output.Policy.DefaultVersionId, "v1");
    assertTrue(output.Policy.IsAttachable);
  });

  it("refuses an AWS-managed policy outside the catalogue", async () => {
    // Given a simulation.
    const simIam = new SimAws().iam();

    // When it is asked for an AWS-managed policy the catalogue does not hold.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.getPolicy(
        new GetPolicyCommand({
          PolicyArn: "arn:aws:iam::aws:policy/AmazonMacieFullAccess",
        }),
      ),
    );

    // Then it answers as IAM does for a policy that does not exist.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });
});
