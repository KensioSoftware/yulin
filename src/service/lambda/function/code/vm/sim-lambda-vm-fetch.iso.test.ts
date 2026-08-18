import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoHosted,
} from "../../../../../../test/cognito/federation-fixture.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

/**
 * Zip code that exchanges an authorization code with `fetch`, reading where
 * the pool is served from its environment as a deployed function does.
 */
const exchangeSource = `
exports.handler = async (event) => {
  const response = await fetch(
    "https://" + process.env.AUTH_HOST + "/oauth2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.CLIENT_ID,
        code: event.code,
        redirect_uri: process.env.CALLBACK_URL,
      }).toString(),
    },
  );

  const tokens = await response.json();

  return { status: response.status, tokenType: tokens.token_type };
};
`;

describe("sim Lambda vm code using fetch", () => {
  it("answers a request to a hostname the simulation serves", async () => {
    // Given a pool with a hosted domain and the code a browser carried to the
    // callback.
    const setUp = await simCognitoHosted();
    const code = await simCognitoAuthorizationCode(setUp);

    // And a function whose deployment package is real zip code, as a deployed
    // one is.
    await setUp.simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "user",
        Role: "arn:aws:iam::111111111111:role/UserRole",
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(exchangeSource) },
        Environment: {
          Variables: {
            AUTH_HOST: setUp.domainHost,
            CLIENT_ID: setUp.clientId,
            CALLBACK_URL: simCognitoCallbackUrl,
          },
        },
      }),
    );

    // When it is invoked.
    const output = await setUp.simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "user",
        Payload: JSON.stringify({ code }),
      }),
    );

    // Then the sandbox's own fetch was answered by the simulation, rather
    // than being missing from the sandbox or reaching the network.
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertIdentical(
      Buffer.from(output.Payload).toString(),
      '{"status":200,"tokenType":"Bearer"}',
    );

    await setUp.simAws.backgroundTasksComplete();
  });
});
