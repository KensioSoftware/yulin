import {
  CreateFunctionCommand,
  GetFunctionCommand,
  TagResourceCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

/**
 * A Role allowed exactly the given Lambda actions on every function, and
 * iam:PassRole so it can hand a function its execution role.
 */
async function callerAllowed(
  simAws: SimAws,
  accountId: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const roleName = `Caller${String(actions.length)}`;
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
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
      RoleName: roleName,
      PolicyName: "Allowed",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: [
          { Effect: "Allow", Action: [...actions], Resource: "*" },
          { Effect: "Allow", Action: "iam:PassRole", Resource: "*" },
        ],
      }),
    }),
  );

  return { kind: "arn", arn: created.Role.Arn };
}

function ordersCreation(
  accountId: string,
  tags?: Record<string, string>,
): CreateFunctionCommand {
  return new CreateFunctionCommand({
    FunctionName: "orders",
    Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
    Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    Tags: tags,
  });
}

describe("Lambda tagging IAM authorization", () => {
  it("denies creating a tagged function without lambda:TagResource", async () => {
    // Given a caller allowed to create functions but not to tag them.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const caller = await callerAllowed(simAws, accountId, [
      "lambda:CreateFunction",
    ]);

    // When it creates a function with a tag.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .createFunction(ordersCreation(accountId, { team: "payments" }), {
          caller,
        }),
    );

    // Then tagging on create is denied as TagResource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:TagResource");
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));
  });

  it("allows creating an untagged function without lambda:TagResource", async () => {
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const caller = await callerAllowed(simAws, accountId, [
      "lambda:CreateFunction",
    ]);

    const created = await simAws
      .lambda()
      .createFunction(ordersCreation(accountId), { caller });

    assertIdentical(created.FunctionName, "orders");
    await simAws.backgroundTasksComplete();
  });

  it("leaves Tags out of GetFunction for a caller without lambda:ListTags", async () => {
    // Given a tagged function, and a caller allowed to read it but not to
    // list its tags.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    await simAws
      .lambda()
      .createFunction(ordersCreation(accountId, { team: "payments" }));
    const reader = await callerAllowed(simAws, accountId, [
      "lambda:GetFunction",
    ]);
    const tagReader = await callerAllowed(simAws, accountId, [
      "lambda:GetFunction",
      "lambda:ListTags",
    ]);

    // When each reads the function.
    const withoutTags = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }), {
        caller: reader,
      });
    const withTags = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }), {
        caller: tagReader,
      });

    // Then only the one allowed to list them sees the tags.
    assertUndefined(withoutTags.Tags);
    assertObjectEquals(withTags.Tags, { team: "payments" });
    await simAws.backgroundTasksComplete();
  });

  it("denies TagResource to a caller without lambda:TagResource", async () => {
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const created = await simAws
      .lambda()
      .createFunction(ordersCreation(accountId));

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().tagResource(
        new TagResourceCommand({
          Resource: created.FunctionArn,
          Tags: { team: "payments" },
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:TagResource");
    await simAws.backgroundTasksComplete();
  });
});
