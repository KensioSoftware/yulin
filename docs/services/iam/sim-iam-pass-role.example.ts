/**
 * Authorizing the execution role a Lambda function is created with.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

const deployerCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Deployer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "cloudformation.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Deployer",
    PolicyName: "DeployFunctions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
        {
          Effect: "Allow",
          Action: "iam:PassRole",
          Resource: "arn:aws:iam::123456789012:role/ReportsExecutionRole",
          Condition: {
            StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" },
          },
        },
      ],
    }),
  }),
);

const asDeployer = {
  caller: { kind: "arn", arn: deployerCreation.Role.Arn },
} as const;

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reports",
    Role: "arn:aws:iam::123456789012:role/ReportsExecutionRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => null) },
  }),
  asDeployer,
);

try {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "invoices",
      Role: "arn:aws:iam::123456789012:role/AdminRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => null) },
    }),
    asDeployer,
  );
} catch (error) {
  console.error("Passing AdminRole to Lambda was refused", error);
}

await simAws.backgroundTasksComplete();
