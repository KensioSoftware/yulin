import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "./local-server/sim-aws-local-server.js";
import { SimAws } from "../../service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../service/lambda/function/code/lambda-zip-file-input.js";

describe("Repeated Set-Cookie headers served on localhost", () => {
  it("sends one header per cookie the response carries", async () => {
    // Given a sign-out route clearing two cookies at once.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "sign-out",
        Role: "arn:aws:iam::111111111111:role/SignOutRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 303,
            headers: { location: "/" },
            cookies: [
              "session=; Path=/; Max-Age=0",
              "signed-in=; Path=/; Max-Age=0",
            ],
          })),
        },
      }),
    );
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "sign-out",
          AuthType: "NONE",
        }),
      );
    assertNonNullable(functionUrl);

    const srv = await serveSimAws({ simAws });

    try {
      // When it answers a request over the local server.
      const response = await fetch(srv.localUrl(`${functionUrl}sign-out`), {
        redirect: "manual",
      });

      // Then the viewer is given both cookies to clear.
      assertArrayEquals(response.headers.getSetCookie(), [
        "session=; Path=/; Max-Age=0",
        "signed-in=; Path=/; Max-Age=0",
      ]);
    } finally {
      await srv.close();
    }
  });
});
