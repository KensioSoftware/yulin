import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimLambdaResourceNotFoundException } from "../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("simulated Lambda permission SDK Command routing", () => {
  it("round-trips the resource-policy Commands through an intercepted client", async () => {
    // Given an intercepted Lambda client with a function
    using simSdk = new SimSdk();
    const client = new LambdaClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateFunctionCommand({
        FunctionName: "intercepted",
        Role: "arn:aws:iam::111111111111:role/InterceptedRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );

    // When a permission is granted, read back, and revoked through the client
    const added = await client.send(
      new AddPermissionCommand({
        FunctionName: "intercepted",
        StatementId: "AllowOtherAccount",
        Action: "lambda:InvokeFunctionUrl",
        Principal: "222222222222",
        FunctionUrlAuthType: "AWS_IAM",
      }),
    );
    const policy = await client.send(
      new GetPolicyCommand({ FunctionName: "intercepted" }),
    );
    await client.send(
      new RemovePermissionCommand({
        FunctionName: "intercepted",
        StatementId: "AllowOtherAccount",
      }),
    );

    // Then each reached the simulated Lambda in the client's Region scope, and
    // the function is back to having no policy
    expect(added.Statement).toContain("AllowOtherAccount");
    expect(policy.Policy).toContain("lambda:InvokeFunctionUrl");
    await expect(
      client.send(new GetPolicyCommand({ FunctionName: "intercepted" })),
    ).rejects.toThrow(SimLambdaResourceNotFoundException);
  });
});
