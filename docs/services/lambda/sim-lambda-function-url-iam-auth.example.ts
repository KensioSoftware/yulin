/**
 * Invoking a simulated Lambda Function URL that requires IAM authentication.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  type SimLambdaFunctionUrlEvent,
  makeLambdaZipFileInput,
} from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const roleArn = "arn:aws:iam::888888888888:role/Reporter";

const created = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reporter",
    Role: "arn:aws:iam::888888888888:role/ReporterExecutionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaFunctionUrlEvent) => ({
        statusCode: 200,
        body: `called by ${event.requestContext.authorizer?.iam?.userArn ?? "nobody"}`,
      })),
    },
  }),
);

const urlConfig = await simAws.lambda().createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "reporter",
    AuthType: "AWS_IAM",
  }),
);

// The Role that is allowed to call the endpoint.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "InvokeReporterUrl",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "lambda:InvokeFunctionUrl",
        Resource: created.FunctionArn,
      },
    }),
  }),
);

const srv = await serveSimAws({ simAws });

try {
  const url = srv.localUrl(urlConfig.FunctionUrl);

  // Unauthenticated, so anonymous, so refused.
  const refused = await fetch(url);
  console.log(refused.status); // 403

  // Named as the Role that is allowed to invoke.
  const allowed = await fetch(url, {
    headers: { "x-sim-aws-caller": roleArn },
  });

  console.log(allowed.status); // 200
  console.log(await allowed.text()); // called by arn:aws:iam::888888888888:role/Reporter
} finally {
  srv.close();
}
