/**
 * Granting another Account permission to invoke a simulated Lambda function.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::888888888888:role/GreeterRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
  }),
);

const added = await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "greeter",
    StatementId: "AllowOtherAccount",
    Action: "lambda:InvokeFunctionUrl",
    Principal: "222222222222",
    FunctionUrlAuthType: "AWS_IAM",
  }),
);

// The statement the shorthand expanded into.
console.log(added.Statement);

const policy = await simAws
  .lambda()
  .getPolicy(new GetPolicyCommand({ FunctionName: "greeter" }));

console.log(policy.Policy);
