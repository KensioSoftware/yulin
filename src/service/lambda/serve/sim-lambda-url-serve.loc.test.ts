import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("Serving a sim Lambda Function URL on localhost", () => {
  it("invokes the function over real localhost HTTP", async () => {
    // Given a sim Lambda function with a public Function URL, served on
    // localhost alongside the other simulated services.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: { queryStringParameters?: { name?: string } }) => ({
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: `Hello ${event.queryStringParameters?.name ?? "world"}`,
            }),
          ),
        },
      }),
    );

    const created = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );

    const srv = await serveSimAws({ simAws });

    try {
      // When the Function URL is fetched over localhost.
      const response = await fetch(
        srv.localUrl(`${created.FunctionUrl}greet?name=Yulin`),
      );

      // Then the function handled the real HTTP request.
      assertIdentical(response.status, 200);
      assertIdentical(response.headers.get("content-type"), "text/plain");
      assertIdentical(await response.text(), "Hello Yulin");
    } finally {
      srv.close();
    }
  });
});
