import {
  AddPermissionCommand,
  CreateFunctionCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const callerRoleArn = "arn:aws:iam::222222222222:role/Caller";

async function serveGreeter(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: "arn:aws:iam::888888888888:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
    }),
  );

  return simAws;
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

  it("allows a caller the function's resource policy grants", async () => {
    // Given the same principal granted lambda:InvokeFunction on the function
    const simAws = await serveGreeter();
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: callerRoleArn,
      }),
    );

    // When they invoke it
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter" }), {
        caller: { kind: "arn", arn: callerRoleArn },
      });

    // Then the grant is enough on its own, which is what AddPermission is for
    expect(output.StatusCode).toBe(200);
  });
});
