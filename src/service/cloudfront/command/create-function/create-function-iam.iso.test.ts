import { CreateFunctionCommand } from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimCloudFrontFunction,
  type SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import { SimCloudFront } from "../../sim-cloudfront.js";

describe("CloudFront CreateFunctionCommand IAM authorization", () => {
  it("allows the default Account root caller and publishes the Function", async () => {
    // Given CloudFront in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const functionName = "root-created-function" as SimCloudFrontFunctionName;

    // When a Function is created without an explicit caller.
    const output = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: functionName,
        FunctionConfig: {
          Comment: "Created by Account root",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            return event.request;
          }
        `),
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then IAM defaults to Account root and CloudFront publishes the Function.
    assertIdentical(
      output.FunctionMetadata.FunctionARN,
      `arn:aws:cloudfront::${accountId}:function/${functionName}`,
    );
    assertIdentical(
      simCloudFront.getCloudFrontFunctionByName(functionName)?.status,
      "UNASSOCIATED",
    );
  });

  it("allows a Role when its action, Function ARN, and principal condition match", async () => {
    // Given a Role conditionally allowed to create one named CloudFront Function.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const functionName = "conditional-function" as SimCloudFrontFunctionName;

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalFunctionCreator",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = roleCreation.Role.Arn;
    const functionArn = `arn:aws:cloudfront::${accountId}:function/${functionName}`;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionalFunctionCreator",
        PolicyName: "CreateConditionalFunction",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:CreateFunction",
            Resource: functionArn,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role creates the Function named by its policy.
    const output = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: functionName,
        FunctionConfig: {
          Comment: "Created by a conditionally authorized Role",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            return event.request;
          }
        `),
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );
    assertNonNullable(output.FunctionMetadata.FunctionARN);

    await simAws.backgroundTasksComplete();

    // Then IAM permits the request and CloudFront makes the Function available by ARN.
    const functionByArn = simCloudFront.getCloudFrontFunctionByArn(
      output.FunctionMetadata.FunctionARN,
    );
    assertInstanceOf(functionByArn, SimCloudFrontFunction);
    assertIdentical(functionByArn.status, "UNASSOCIATED");
  });

  it("implicitly denies a Role when its principal condition does not match", async () => {
    // Given a Role with a matching Function ARN but a condition for another Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const functionName =
      "condition-denied-function" as SimCloudFrontFunctionName;
    const functionArn = `arn:aws:cloudfront::${accountId}:function/${functionName}`;

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchFunctionCreator",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchFunctionCreator",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:CreateFunction",
            Resource: functionArn,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to create the otherwise authorized Function.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "Denied by a principal condition",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: Buffer.from(`
            function handler(event) {
              return event.request;
            }
          `),
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies creation before CloudFront registers the Function.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:CreateFunction");
    assertIdentical(error.resource, functionArn);
    assertUndefined(simCloudFront.getCloudFrontFunctionByName(functionName));
  });

  it("lets an explicit Deny override an Allow without registering the Function", async () => {
    // Given a Role with conflicting Allow and Deny statements for one Function ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const functionName =
      "explicitly-denied-function" as SimCloudFrontFunctionName;
    const functionArn = `arn:aws:cloudfront::${accountId}:function/${functionName}`;

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedFunctionCreator",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedFunctionCreator",
        PolicyName: "ConflictingFunctionCreation",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "cloudfront:CreateFunction",
              Resource: functionArn,
            },
            {
              Effect: "Deny",
              Action: "cloudfront:CreateFunction",
              Resource: functionArn,
            },
          ],
        }),
      }),
    );

    // When the Role attempts to create the explicitly denied Function.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "Explicitly denied",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: Buffer.from(`
            function handler(event) {
              return event.request;
            }
          `),
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins and CloudFront retains no Function with that name.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: cloudfront:CreateFunction on resource: ${functionArn}`,
    );
    assertUndefined(simCloudFront.getCloudFrontFunctionByName(functionName));
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given CloudFront in an Account where an omitted caller would be Account root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const functionName =
      "anonymous-denied-function" as SimCloudFrontFunctionName;

    // When an anonymous caller attempts to create a Function.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "Anonymous caller",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: Buffer.from(`
            function handler(event) {
              return event.request;
            }
          `),
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity and CloudFront does not register the Function.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertUndefined(simCloudFront.getCloudFrontFunctionByName(functionName));
  });

  it("uses allow-all authorization when SimCloudFront is instantiated directly", async () => {
    // Given standalone CloudFront with no supplied IAM implementation.
    const simCloudFront = new SimCloudFront();
    const functionName = "standalone-function" as SimCloudFrontFunctionName;

    // When an anonymous caller creates a Function through the standalone service.
    const output = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: functionName,
        FunctionConfig: {
          Comment: "Standalone CloudFront",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            return event.request;
          }
        `),
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits creation and CloudFront registers the Function.
    assertIdentical(output.FunctionSummary.Name, functionName);
    assertInstanceOf(
      simCloudFront.getCloudFrontFunctionByName(functionName),
      SimCloudFrontFunction,
    );
  });
});
