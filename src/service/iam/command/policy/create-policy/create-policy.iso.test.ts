import { CreatePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import {
  SimIamEntityAlreadyExists,
  SimIamLimitExceeded,
  SimIamValidationError,
} from "../../../error/sim-iam.error.js";
import { simIamPolicyDocumentOfSize } from "../../../policy/sim-iam-policy-document-of-size.js";
import { maxSimIamManagedPolicyCharacters } from "../../../validate/size/sim-iam-policy-document-size.js";

describe("IAM CreatePolicyCommand", () => {
  it("creates an IAM Policy through the SimIam service", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "TestPolicy",
        Path: "/service-role/",
        Description: "Policy used by CreatePolicyCommand tests",
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

    assertIdentical(policyCreation.Policy.PolicyName, "TestPolicy");
    assertIdentical(policyCreation.Policy.Path, "/service-role/");
    assertIdentical(policyCreation.Policy.DefaultVersionId, "v1");
    assertIdentical(policyCreation.Policy.AttachmentCount, 0);
    assertIdentical(policyCreation.Policy.PermissionsBoundaryUsageCount, 0);
    assertTrue(policyCreation.Policy.IsAttachable);
    assertIdentical(
      policyCreation.Policy.Description,
      "Policy used by CreatePolicyCommand tests",
    );
    assertNonNullable(policyCreation.Policy.PolicyId);
    assertIdentical(
      policyCreation.Policy.Arn,
      "arn:aws:iam::123456789012:policy/service-role/TestPolicy",
    );
    assertInstanceOf(policyCreation.Policy.CreateDate, Date);
    assertInstanceOf(policyCreation.Policy.UpdateDate, Date);
    assertIdentical(
      policyCreation.Policy.UpdateDate,
      policyCreation.Policy.CreateDate,
    );
  });

  it("defaults optional values when creating an IAM Policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "DefaultedPolicy",
        PolicyDocument: undefined,
      }),
    );

    assertIdentical(policyCreation.Policy.PolicyName, "DefaultedPolicy");
    assertIdentical(policyCreation.Policy.Path, "/");
    assertIdentical(
      policyCreation.Policy.Arn,
      "arn:aws:iam::123456789012:policy/DefaultedPolicy",
    );
    assertUndefined(policyCreation.Policy.Description);
    assertIdentical(policyCreation.Policy.DefaultVersionId, "v1");
    assertIdentical(policyCreation.Policy.AttachmentCount, 0);
    assertIdentical(policyCreation.Policy.PermissionsBoundaryUsageCount, 0);
    assertTrue(policyCreation.Policy.IsAttachable);
    assertInstanceOf(policyCreation.Policy.CreateDate, Date);
    assertInstanceOf(policyCreation.Policy.UpdateDate, Date);
  });

  it("normalises IAM Policy paths", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const withoutSlashes = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "WithoutSlashes",
        Path: "application",
        PolicyDocument: undefined,
      }),
    );
    const withoutTrailingSlash = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "WithoutTrailingSlash",
        Path: "/service-role",
        PolicyDocument: undefined,
      }),
    );
    const emptyPath = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "EmptyPath",
        Path: "",
        PolicyDocument: undefined,
      }),
    );

    assertIdentical(withoutSlashes.Policy.Path, "/application/");
    assertIdentical(
      withoutSlashes.Policy.Arn,
      "arn:aws:iam::123456789012:policy/application/WithoutSlashes",
    );
    assertIdentical(withoutTrailingSlash.Policy.Path, "/service-role/");
    assertIdentical(
      withoutTrailingSlash.Policy.Arn,
      "arn:aws:iam::123456789012:policy/service-role/WithoutTrailingSlash",
    );
    assertIdentical(emptyPath.Policy.Path, "/");
    assertIdentical(
      emptyPath.Policy.Arn,
      "arn:aws:iam::123456789012:policy/EmptyPath",
    );
  });

  it("uses the SimAws default account ID when building the IAM Policy ARN", async () => {
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
    });

    const simIam = simAws.iam();

    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "AccountScopedPolicy",
        Path: "/application/",
        PolicyDocument: undefined,
      }),
    );

    assertIdentical(
      policyCreation.Policy.Arn,
      `arn:aws:iam::${accountId}:policy/application/AccountScopedPolicy`,
    );
  });

  it("throws when PolicyName is undefined", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: undefined,
          PolicyDocument: undefined,
        }),
      ),
    );

    assertIdentical(error.message, "PolicyName is required");
  });

  it("throws when PolicyName is empty", async () => {
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: "",
          PolicyDocument: undefined,
        }),
      ),
    );

    assertIdentical(error.message, "PolicyName is required");
  });

  it("throws when creating a duplicate IAM Policy in the same path", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "DuplicatePolicy",
        Path: "/application/",
        PolicyDocument: undefined,
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: "DuplicatePolicy",
          Path: "/application",
          PolicyDocument: undefined,
        }),
      ),
    );

    assertIdentical(
      error.message,
      "A policy called DuplicatePolicy already exists. Duplicate names are not allowed.",
    );
  });

  it("refuses a policy name the Account already holds at another path", async () => {
    // Given a policy named SharedPolicyName under /application/
    const simAws = new SimAws();
    const simIam = simAws.account("123456789012").iam();
    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "SharedPolicyName",
        Path: "/application/",
        PolicyDocument: undefined,
      }),
    );

    // When a policy of the same name, in another case, is created under
    // /service-role/
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: "sharedpolicyname",
          Path: "/service-role/",
          PolicyDocument: undefined,
        }),
      ),
    );

    // Then IAM refuses it, since a policy name is unique in the Account
    assertInstanceOf(error, SimIamEntityAlreadyExists);
  });

  it("refuses a policy name holding a slash", async () => {
    // Given a policy named Read under /application/
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Read",
        Path: "/application/",
        PolicyDocument: undefined,
      }),
    );

    // When a policy named application/Read is created at /, which would
    // share its ARN
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: "application/Read",
          PolicyDocument: undefined,
        }),
      ),
    );

    // Then IAM refuses the name, and the first policy is left alone
    assertInstanceOf(error, SimIamValidationError);
    assertMapSize(simIam.policies, 1);
  });

  it("refuses a policy document over IAM's character limit", async () => {
    // Given a managed policy document one character past the 6,144 IAM takes.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamManagedPolicyCharacters + 1),
    );

    // When the Policy is created from it.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createPolicy(
        new CreatePolicyCommand({
          PolicyName: "ExecutionPolicy",
          PolicyDocument: policyDocument,
        }),
      ),
    );

    // Then IAM refuses the document rather than keeping a policy no account
    // would carry.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(error.message, "Cannot exceed quota for PolicySize: 6144");
  });

  it("accepts a document only under the limit once whitespace is out", async () => {
    // Given a managed policy document at the limit, indented well past it.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamManagedPolicyCharacters),
      undefined,
      4,
    );

    // When the Policy is created from it.
    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "IndentedPolicy",
        PolicyDocument: policyDocument,
      }),
    );

    // Then the indentation counted for nothing, as it does in IAM.
    assertIdentical(policyCreation.Policy.PolicyName, "IndentedPolicy");
  });
});
