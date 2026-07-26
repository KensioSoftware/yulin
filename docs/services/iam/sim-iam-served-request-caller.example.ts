/**
 * Naming the caller of an HTTP request into simulated AWS.
 */

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "reporter",
    Role: "arn:aws:iam::111111111111:role/ReporterRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
  }),
);

const urlConfig = await simAws.lambda().createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "reporter",
    AuthType: "NONE",
  }),
);

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl(urlConfig.FunctionUrl), {
    headers: { "x-sim-aws-caller": "arn:aws:iam::111111111111:role/Reporter" },
  });

  // arn:aws:iam::111111111111:role/Reporter
  console.log(response.headers.get("x-sim-aws-caller"));
  // caller-header
  console.log(response.headers.get("x-sim-aws-auth"));
} finally {
  srv.close();
}
