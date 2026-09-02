/**
 * Serving a simulated Lambda Function URL configured for CORS.
 */

import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rates",
    Role: "arn:aws:iam::111111111111:role/RatesRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gbp: 1.27 }),
      })),
    },
  }),
);

const urlConfig = await lambda.createFunctionUrlConfig(
  new CreateFunctionUrlConfigCommand({
    FunctionName: "rates",
    AuthType: "NONE",
    Cors: {
      AllowOrigins: ["https://shop.example.com"],
      AllowMethods: ["GET", "POST"],
      AllowHeaders: ["content-type"],
      ExposeHeaders: ["x-request-id"],
      AllowCredentials: true,
      MaxAge: 600,
    },
  }),
);

const srv = await serveSimAws({ simAws });
const endpoint = srv.localUrl(urlConfig.FunctionUrl);

try {
  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      origin: "https://shop.example.com",
      "access-control-request-method": "GET",
    },
  });

  // 200 https://shop.example.com GET,POST
  console.log(
    preflight.status,
    preflight.headers.get("access-control-allow-origin"),
    preflight.headers.get("access-control-allow-methods"),
  );

  const response = await fetch(endpoint, {
    headers: { origin: "https://shop.example.com" },
  });

  // {"gbp":1.27} x-request-id
  console.log(
    await response.text(),
    response.headers.get("access-control-expose-headers"),
  );
} finally {
  await srv.close();
}
