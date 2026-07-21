import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

const policyArn = "arn:aws:iam::123456789012:policy/ReadReports";

describe("IAM AttachRolePolicyCommand errors", () => {
  it("throws when RoleName is undefined", async () => {
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: undefined,
          PolicyArn: policyArn,
        }),
      ),
    );

    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when RoleName is empty", async () => {
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: "",
          PolicyArn: policyArn,
        }),
      ),
    );

    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when PolicyArn is undefined", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyArn: undefined,
        }),
      ),
    );

    assertIdentical(error.message, "PolicyArn is required");
  });

  it("throws when PolicyArn is empty", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyArn: "",
        }),
      ),
    );

    assertIdentical(error.message, "PolicyArn is required");
  });

  it("throws when the Role does not exist", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: "MissingRole",
          PolicyArn: policyArn,
        }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(error.message, "No IAM Role with name MissingRole");
  });
});
