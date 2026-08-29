import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { SimIamLimitExceeded } from "../../../error/sim-iam.error.js";
import { simIamPolicyDocumentOfSize } from "../../../policy/sim-iam-policy-document-of-size.js";
import { maxSimIamInlinePolicyCharacters } from "../../../validate/size/sim-iam-policy-document-size.js";

describe("IAM PutRolePolicyCommand errors", () => {
  it("throws when RoleName is undefined", async () => {
    // Given an IAM service.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    // When an inline policy is put without a RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: undefined,
          PolicyName: "ReadObjects",
          PolicyDocument: "{}",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when RoleName is empty", async () => {
    // Given an IAM service.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    // When an inline policy is put with an empty RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "",
          PolicyName: "ReadObjects",
          PolicyDocument: "{}",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when PolicyName is undefined", async () => {
    // Given an IAM Role exists.
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

    // When an inline policy is put without a PolicyName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: undefined,
          PolicyDocument: "{}",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "PolicyName is required");
  });

  it("throws when PolicyName is empty", async () => {
    // Given an IAM Role exists.
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

    // When an inline policy is put with an empty PolicyName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "",
          PolicyDocument: "{}",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "PolicyName is required");
  });

  it("throws when PolicyDocument is undefined", async () => {
    // Given an IAM Role exists.
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

    // When an inline policy is put without a PolicyDocument.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "ReadObjects",
          PolicyDocument: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "PolicyDocument is required");
  });

  it("throws when PolicyDocument is empty", async () => {
    // Given an IAM Role exists.
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

    // When an inline policy is put with an empty PolicyDocument.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "ReadObjects",
          PolicyDocument: "",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "PolicyDocument is required");
  });

  it("throws when the Role does not exist", async () => {
    // Given an IAM service with no matching Role.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When an inline policy is put for a missing Role.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "MissingRole",
          PolicyName: "ReadObjects",
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
      ),
    );

    // Then IAM reports that the entity does not exist.
    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(error.message, "No IAM Role with name MissingRole");
  });

  it("refuses an inline policy document over IAM's character limit", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportingRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When an inline policy one character past the 10,240 IAM takes is put
    // onto it.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamInlinePolicyCharacters + 1),
    );
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ReportingRole",
          PolicyName: "ReadObjects",
          PolicyDocument: policyDocument,
        }),
      ),
    );

    // Then IAM refuses the document, naming the Role it was going onto.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Maximum policy size of 10240 bytes exceeded for role ReportingRole",
    );
  });
});
