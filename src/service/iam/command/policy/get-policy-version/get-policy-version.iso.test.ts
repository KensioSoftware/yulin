import {
  CreatePolicyCommand,
  GetPolicyVersionCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

describe("IAM GetPolicyVersionCommand", () => {
  it("answers with an AWS-managed policy's document, URL-encoded", async () => {
    // Given a simulation.
    const simIam = new SimAws().iam();

    // When it is asked for the default version of AmazonSQSFullAccess.
    const output = await simIam.getPolicyVersion(
      new GetPolicyVersionCommand({
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSQSFullAccess",
        VersionId: "v1",
      }),
    );

    // Then the document decodes to what AWS publishes.
    assertNonNullable(output.PolicyVersion.Document);
    assertTrue(output.PolicyVersion.IsDefaultVersion);
    assertIdentical(
      decodeURIComponent(output.PolicyVersion.Document),
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Action: ["sqs:*"], Effect: "Allow", Resource: "*" }],
      }),
    );
  });

  it("answers with an Account's own policy's document", async () => {
    // Given a customer-managed policy.
    const simIam = new SimAws().iam();
    const document = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
    });
    const creation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: faker.string.alpha(12),
        PolicyDocument: document,
      }),
    );

    // When its default version is asked for.
    const output = await simIam.getPolicyVersion(
      new GetPolicyVersionCommand({
        PolicyArn: creation.Policy.Arn,
        VersionId: "v1",
      }),
    );

    // Then the document decodes to what was created.
    assertNonNullable(output.PolicyVersion.Document);
    assertIdentical(
      decodeURIComponent(output.PolicyVersion.Document),
      document,
    );
  });

  it("refuses a version the policy does not have", async () => {
    // Given a simulation.
    const simIam = new SimAws().iam();

    // When it is asked for a version of AdministratorAccess that is not its
    // default.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.getPolicyVersion(
        new GetPolicyVersionCommand({
          PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
          VersionId: "v9",
        }),
      ),
    );

    // Then it refuses as IAM does.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("requires a PolicyArn and a VersionId", async () => {
    const simIam = new SimAws().iam();

    await assertThrowsErrorAsync(async () =>
      simIam.getPolicyVersion({ input: { VersionId: "v1" } }),
    );
    await assertThrowsErrorAsync(async () =>
      simIam.getPolicyVersion({
        input: { PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      }),
    );
  });
});
