import {
  AddPermissionCommand,
  CreateFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const ownerAccountId = "888888888888";
const callerAccountId = "222222222222";
const ownAccountRoleArn = `arn:aws:iam::${ownerAccountId}:role/Caller`;
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

const greeterCode = { ZipFile: makeLambdaZipFileInput(() => "hello") };

describe("Invoking a function through its resource policy", () => {
  it("refuses a caller with neither an identity nor a resource grant", async () => {
    // Given a function nobody has been granted anything on
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: `arn:aws:iam::${ownerAccountId}:role/GreeterRole`,
        Code: greeterCode,
      }),
    );

    // When a principal from another Account invokes it
    // Then it is denied, as nothing allows the call
    await expect(
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      }),
    ).rejects.toThrow(SimIamAccessDenied);
  });

  it("allows a same-Account caller the function's resource policy grants", async () => {
    // Given a function
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: `arn:aws:iam::${ownerAccountId}:role/GreeterRole`,
        Code: greeterCode,
      }),
    );

    // And a principal in its own Account granted the invocation
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: ownAccountRoleArn,
      }),
    );

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
    // Given a function
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: `arn:aws:iam::${ownerAccountId}:role/GreeterRole`,
        Code: greeterCode,
      }),
    );

    // And a principal from another Account granted only by this function
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

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
    // Given a function
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: `arn:aws:iam::${ownerAccountId}:role/GreeterRole`,
        Code: greeterCode,
      }),
    );

    // And a principal from another Account granted by this function
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

    // And that Account's own identity policy allowing it too
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Caller",
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
        RoleName: "Caller",
        PolicyName: "Invoke",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "lambda:InvokeFunction", Resource: "*" },
        }),
      }),
    );

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
