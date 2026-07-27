import {
  AddPermissionCommand,
  CreateFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { createSimIamRoleWithPolicy } from "../../../../../test/iam/create-role-with-policy.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const ownerAccountId = "888888888888";
const callerAccountId = "222222222222";
const ownAccountRoleArn = `arn:aws:iam::${ownerAccountId}:role/Caller`;
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

async function serveGreeter(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: `arn:aws:iam::${ownerAccountId}:role/GreeterRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
    }),
  );

  return simAws;
}

/**
 * Grant a principal `lambda:InvokeFunction` on the function itself.
 */
async function grantInvoke(simAws: SimAws, principal: string): Promise<void> {
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: "greeter",
      StatementId: "AllowInvoke",
      Action: "lambda:InvokeFunction",
      Principal: principal,
    }),
  );
}

/**
 * The calling Role, in its own Account, allowed to invoke by that Account.
 */
async function allowedCallerRole(simAws: SimAws): Promise<void> {
  await createSimIamRoleWithPolicy({
    simAws,
    accountId: callerAccountId,
    roleName: "Caller",
    policyName: "Invoke",
    action: "lambda:InvokeFunction",
  });
}

describe("Invoking a function through its resource policy", () => {
  it("refuses a caller with neither an identity nor a resource grant", async () => {
    // Given a function nobody has been granted anything on
    const simAws = await serveGreeter();

    // When a principal from another Account invokes it
    // Then it is denied, as nothing allows the call
    await expect(
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    ).rejects.toThrow(SimIamAccessDenied);
  });

  it("allows a same-Account caller the function's resource policy grants", async () => {
    // Given a principal in the function's own Account granted the invocation
    const simAws = await serveGreeter();
    await grantInvoke(simAws, ownAccountRoleArn);

    // When they invoke it
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: ownAccountRoleArn },
      });

    // Then the grant is enough on its own within one Account, which is what
    // AddPermission is for
    expect(output.StatusCode).toBe(200);
  });

  it("refuses a cross-Account caller its own Account does not allow", async () => {
    // Given a principal from another Account granted only by this function
    const simAws = await serveGreeter();
    await grantInvoke(simAws, callerRoleArn);

    // When they invoke it
    // Then it is denied: AWS also requires the caller's own Account to allow
    // the action, and nothing there does
    await expect(
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    ).rejects.toThrow(SimIamAccessDenied);
  });

  it("allows a cross-Account caller both Accounts allow", async () => {
    // Given the same grant, plus an identity policy in the caller's Account
    const simAws = await serveGreeter();
    await grantInvoke(simAws, callerRoleArn);
    await allowedCallerRole(simAws);

    // When they invoke it
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      });

    // Then both sides allow it, as real AWS requires for a cross-Account call
    expect(output.StatusCode).toBe(200);
  });
});
