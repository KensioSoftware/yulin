import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { faker } from "@faker-js/faker";
import { assertNonNullable, assertUndefined } from "@kensio/smartass";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * Create a function running a handler as a Role allowed one action, invoke
 * it, and read back what it returned.
 */
export async function invokedAs(
  simAws: SimAws,
  allowed: string,
  handler: SimLambdaHandler,
): Promise<unknown> {
  const roleName = faker.string.alpha(12);
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "Bedrock",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: allowed, Resource: "*" },
      }),
    }),
  );
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "assistant",
      Role: role.Role.Arn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "assistant" }));

  assertUndefined(output.FunctionError);
  assertNonNullable(output.Payload);

  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}
