import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateDatasetGroupCommand,
  DescribeDatasetGroupCommand,
} from "@aws-sdk/client-personalize";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

async function givenARoleAllowedTo(
  simAws: SimAws,
  action: string,
  resource = "*",
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "PersonalizeCaller",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "PersonalizeCaller",
      PolicyName: "PersonalizePolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: action, Resource: resource },
      }),
    }),
  );

  assertNonNullable(role.Role);
  assertNonNullable(role.Role.Arn);

  return role.Role.Arn;
}

describe("Personalize IAM authorization", () => {
  it("allows a create the caller's policy permits", async () => {
    // Given a Role allowed to create dataset groups.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:CreateDatasetGroup",
    );

    // When it creates one.
    const created = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }), {
        caller: { kind: "arn", arn: roleArn },
      });

    // Then it goes through.
    assertNonNullable(created.datasetGroupArn);
  });

  it("denies a create the caller's policy leaves out", async () => {
    // Given a Role allowed only to describe dataset groups.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:DescribeDatasetGroup",
    );

    // When it tries to create one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createDatasetGroup(
            new CreateDatasetGroupCommand({ name: "lessons" }),
            {
              caller: { kind: "arn", arn: roleArn },
            },
          ),
    );

    // Then Personalize reports it in its own terms, naming the action.
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "personalize:CreateDatasetGroup");
  });

  it("authorizes a describe against the resource ARN", async () => {
    // Given a Role allowed to describe only one dataset group.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const allowed = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    const denied = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "words" }));
    assertNonNullable(allowed.datasetGroupArn);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:DescribeDatasetGroup",
      allowed.datasetGroupArn,
    );

    // When it describes the one it is allowed and then the one it is not.
    const described = await simAws.personalize().describeDatasetGroup(
      new DescribeDatasetGroupCommand({
        datasetGroupArn: allowed.datasetGroupArn,
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().describeDatasetGroup(
          new DescribeDatasetGroupCommand({
            datasetGroupArn: denied.datasetGroupArn,
          }),
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then the resource in the policy is what decides it.
    assertIdentical(described.datasetGroup?.name, "lessons");
    assertIdentical(error.name, "AccessDeniedException");
  });
});
