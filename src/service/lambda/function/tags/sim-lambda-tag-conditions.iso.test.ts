import {
  CreateFunctionCommand,
  InvokeCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimIamPolicyDocumentStatement } from "../../../iam/policy/sim-iam-policy.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";

const code = { ZipFile: makeLambdaZipFileInput(() => "ran") };

/**
 * A simulation, the ARN of its execution role, and a Role whose only policy
 * holds the statements given.
 */
async function simAwsWithCaller(
  statement: SimIamPolicyDocumentStatement | SimIamPolicyDocumentStatement[],
) {
  const accountId = makeSimAwsAccountId();
  const simAws = new SimAws({ defaultAccountId: accountId });
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Caller",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Caller",
      PolicyName: "Tagged",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: statement,
      }),
    }),
  );

  return {
    simAws,
    executionRole: `arn:aws:iam::${accountId}:role/ExecutionRole`,
    caller: { kind: "arn", arn: role.Role.Arn } as const,
  };
}

describe("tags as IAM condition keys on a sim Lambda function", () => {
  it("lets a policy decide an Invoke on the function's own tags", async () => {
    // Given a caller allowed to invoke only functions tagged for its team.
    const { simAws, executionRole, caller } = await simAwsWithCaller({
      Effect: "Allow",
      Action: "lambda:InvokeFunction",
      Resource: "*",
      Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
    });
    for (const team of ["orders", "billing"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: team,
          Role: executionRole,
          Code: code,
          Tags: { team },
        }),
      );
    }

    // When it invokes each.
    const allowed = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }), { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .invoke(new InvokeCommand({ FunctionName: "billing" }), { caller }),
    );

    // Then only its own team's function ran.
    assertIdentical(allowed.StatusCode, 200);
    assertInstanceOf(error, SimIamAccessDenied);
    await simAws.backgroundTasksComplete();
  });

  it("lets a policy decide a CreateFunction on the tags it carries", async () => {
    // Given a caller allowed to create and tag functions for its team alone,
    // and to pass the execution role, which carries no tags to check.
    const { simAws, executionRole, caller } = await simAwsWithCaller([
      {
        Effect: "Allow",
        Action: ["lambda:CreateFunction", "lambda:TagResource"],
        Resource: "*",
        Condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      { Effect: "Allow", Action: "iam:PassRole", Resource: "*" },
    ]);

    // When it creates one tagged for its team and one for another.
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: executionRole,
        Code: code,
        Tags: { team: "orders" },
      }),
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "billing",
          Role: executionRole,
          Code: code,
          Tags: { team: "billing" },
        }),
        { caller },
      ),
    );

    // Then the second is refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("lets a policy decide an UntagResource on the keys it names", async () => {
    // Given a caller allowed to remove only the temporary tag.
    const { simAws, executionRole, caller } = await simAwsWithCaller({
      Effect: "Allow",
      Action: "lambda:UntagResource",
      Resource: "*",
      Condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["temp"] } },
    });
    const { FunctionArn } = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: executionRole,
        Code: code,
        Tags: { team: "orders", temp: "yes" },
      }),
    );

    // When it removes the temporary tag and then the team tag.
    await simAws
      .lambda()
      .untagResource(
        new UntagResourceCommand({ Resource: FunctionArn, TagKeys: ["temp"] }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().untagResource(
        new UntagResourceCommand({
          Resource: FunctionArn,
          TagKeys: ["team"],
        }),
        { caller },
      ),
    );

    // Then the team tag is refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
