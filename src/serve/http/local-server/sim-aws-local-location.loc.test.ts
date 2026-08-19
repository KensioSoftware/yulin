import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertIdentical, assertResponseStatus } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../service/lambda/function/code/lambda-zip-file-input.js";
import { serveSimAws } from "./sim-aws-local-server.js";

/**
 * A Function URL that redirects to a second one, in the way a sign-in page
 * redirects to the endpoint that answers it.
 */
async function makeRedirectingFunctionUrl(simAws: SimAws): Promise<{
  readonly signInUrl: string;
  readonly callbackUrl: string;
}> {
  const lambda = simAws.lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "callback",
      Role: "arn:aws:iam::111111111111:role/CallbackRole",
      Code: {
        ZipFile: makeLambdaZipFileInput(() => ({
          statusCode: 200,
          headers: { "content-type": "text/plain" },
          body: "Signed in",
        })),
      },
    }),
  );

  const callback = await lambda.createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "callback",
      AuthType: "NONE",
    }),
  );

  const callbackUrl = `${callback.FunctionUrl}callback`;

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "sign-in",
      Role: "arn:aws:iam::111111111111:role/SignInRole",
      Code: {
        ZipFile: makeLambdaZipFileInput(() => ({
          statusCode: 303,
          headers: { location: callbackUrl },
          body: "",
        })),
      },
    }),
  );

  const signIn = await lambda.createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "sign-in",
      AuthType: "NONE",
    }),
  );

  return { signInUrl: signIn.FunctionUrl, callbackUrl };
}

describe("Serving a redirect to a simulated hostname on localhost", () => {
  it("answers with the local address of the hostname the redirect names", async () => {
    // Given a served environment whose sign-in Function URL redirects to
    // another Function URL of its own
    const simAws = new SimAws();
    const { signInUrl, callbackUrl } = await makeRedirectingFunctionUrl(simAws);
    const srv = await serveSimAws({ simAws });

    try {
      // When a client that follows redirects itself asks for the sign-in URL
      const response = await fetch(srv.localUrl(signInUrl), {
        redirect: "manual",
      });

      // Then the address it is sent to is the one it can open a connection to
      assertResponseStatus(response, 303);
      assertIdentical(
        response.headers.get("location"),
        srv.localUrl(callbackUrl).toString(),
      );
    } finally {
      await srv.close();
    }
  });

  it("carries a browser following the redirect back into the simulation", async () => {
    // Given the same sign-in Function URL, served on localhost
    const simAws = new SimAws();
    const { signInUrl } = await makeRedirectingFunctionUrl(simAws);
    const srv = await serveSimAws({ simAws });

    try {
      // When the sign-in URL is fetched with redirects followed
      const response = await fetch(srv.localUrl(signInUrl));

      // Then the redirect was followed to the second function, over real
      // localhost HTTP
      assertResponseStatus(response, 200);
      assertIdentical(await response.text(), "Signed in");
    } finally {
      await srv.close();
    }
  });
});
