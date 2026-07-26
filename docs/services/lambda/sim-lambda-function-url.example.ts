/**
 * Serving a simulated Lambda Function URL on localhost.
 */

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
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "greeter",
    Role: "arn:aws:iam::111111111111:role/GreeterRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaFunctionUrlEvent) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `Hello ${event.queryStringParameters?.["name"] ?? "world"}`,
      })),
    },
  }),
);

const urlConfig = await lambda.createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "greeter",
    AuthType: "NONE",
  }),
);

// https://<url-id>.lambda-url.us-east-1.on.aws/
console.log(urlConfig.FunctionUrl);

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(
    srv.localUrl(`${urlConfig.FunctionUrl}greet?name=Yulin`),
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  srv.close();
}
