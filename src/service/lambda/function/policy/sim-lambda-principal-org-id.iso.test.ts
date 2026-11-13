import {
  AddPermissionCommand,
  CreateFunctionCommand,
  InvokeCommand,
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
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";

/**
 * A simulation holding a function that grants every principal in the
 * organization Invoke, and a Role in another Account allowed to invoke it by
 * its own Account.
 */
async function orgGrantedFunction(): Promise<{
  readonly simAws: SimAws;
  readonly callerAccountId: string;
  readonly callerRoleArn: string;
}> {
  const ownerAccountId = makeSimAwsAccountId();
  const callerAccountId = makeSimAwsAccountId();
  const simAws = new SimAws({ defaultAccountId: ownerAccountId });
  const organizations = simAws.organizations();
  organizations.moveAccount(ownerAccountId);

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "ledger",
      Role: `arn:aws:iam::${ownerAccountId}:role/LedgerRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "recorded") },
    }),
  );
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "ledger",
      StatementId: "AllowOrganization",
      Action: "lambda:InvokeFunction",
      Principal: "*",
      PrincipalOrgID: organizations.organizationId(),
    }),
  );

  const callerIam = simAws.account(callerAccountId).iam();
  const role = await callerIam.createRole(
    new CreateRoleCommand({
      RoleName: "LedgerWriter",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await callerIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "LedgerWriter",
      PolicyName: "InvokeLedger",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "lambda:InvokeFunction", Resource: "*" },
      }),
    }),
  );

  return { simAws, callerAccountId, callerRoleArn: role.Role.Arn };
}

describe("a Lambda permission conditioned on aws:PrincipalOrgID", () => {
  it("admits a caller from another Account in the organization", async () => {
    // Given the caller's Account in the same organization as the function's.
    const { simAws, callerAccountId, callerRoleArn } =
      await orgGrantedFunction();
    simAws.organizations().moveAccount(callerAccountId);

    // When the caller invokes the function.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "ledger" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      });

    // Then the organization grant admits it.
    assertIdentical(output.StatusCode, 200);
    await simAws.backgroundTasksComplete();
  });

  it("refuses a caller from an Account outside the organization", async () => {
    // Given the caller's Account outside every organization.
    const { simAws, callerRoleArn } = await orgGrantedFunction();

    // When the caller invokes the function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "ledger" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    );

    // Then the grant does not reach it.
    assertInstanceOf(error, SimIamAccessDenied);
    await simAws.backgroundTasksComplete();
  });
});
