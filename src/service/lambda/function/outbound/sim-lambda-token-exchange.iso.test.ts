import https from "node:https";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoHosted,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * The tokens a hosted domain answers a code exchange with.
 */
interface TokenResponse {
  readonly id_token?: string;
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly token_type?: string;
  readonly error?: string;
}

/**
 * The event the exchanging function is invoked with, which is what the
 * callback request carried.
 */
interface CallbackEvent {
  readonly code: string;
}

/**
 * The template a server-side callback function is declared by, as the stack
 * of an application moving its sign-in to managed login holds it.
 */
const userFunctionTemplate = {
  Resources: {
    UserFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "user",
        Role: "arn:aws:iam::111111111111:role/UserRole",
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: { ZipFile: "exports.handler = async () => 'callback';" },
      },
    },
  },
};

/**
 * The form fields an authorization code grant is exchanged with.
 */
function exchangeFields(code: string): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: simCognitoCallbackUrl,
  }).toString();
}

/**
 * The header a server-side app client authenticates itself with.
 */
function clientAuthorization(setUp: SimCognitoHostedSetUp): string {
  return `Basic ${Buffer.from(
    `${setUp.clientId}:${setUp.clientSecret ?? ""}`,
  ).toString("base64")}`;
}

/**
 * A handler that exchanges the code with `fetch`, as a Node.js handler doing
 * this is written today.
 */
function fetchExchangeHandler(setUp: SimCognitoHostedSetUp): SimLambdaHandler {
  return async (event: CallbackEvent): Promise<TokenResponse> => {
    const response = await fetch(`https://${setUp.domainHost}/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: clientAuthorization(setUp),
      },
      body: exchangeFields(event.code),
    });

    return (await response.json()) as TokenResponse;
  };
}

/**
 * A handler that exchanges the code through `node:https`, which is the same
 * request written without the Fetch API.
 */
function httpsExchangeHandler(setUp: SimCognitoHostedSetUp): SimLambdaHandler {
  return async (event: CallbackEvent): Promise<TokenResponse> =>
    await new Promise((resolve, reject) => {
      const body = exchangeFields(event.code);
      const request = https.request(
        {
          hostname: setUp.domainHost,
          path: "/oauth2/token",
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(body),
            authorization: clientAuthorization(setUp),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });
          response.on("end", () => {
            resolve(
              JSON.parse(Buffer.concat(chunks).toString()) as TokenResponse,
            );
          });
        },
      );

      request.on("error", reject);
      request.end(body);
    });
}

/**
 * Deploy the callback function with a handler bound to it.
 */
async function deployExchanger(
  setUp: SimCognitoHostedSetUp,
  handler: SimLambdaHandler,
): Promise<void> {
  const stack = await setUp.simAws.cloudFormation().deployTemplate({
    stackName: "user-stack",
    template: userFunctionTemplate,
    bindings: [{ functionName: "user", handler }],
  });
  await stack.waitForDeployComplete();
}

/**
 * Invoke the deployed function with the code the browser carried.
 */
async function exchangedTokens(
  setUp: SimCognitoHostedSetUp,
  code: string,
): Promise<TokenResponse> {
  const output = await setUp.simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: "user",
      Payload: JSON.stringify({ code }),
    }),
  );

  assertUndefined(output.FunctionError);
  assertNonNullable(output.Payload);

  const tokens = JSON.parse(
    Buffer.from(output.Payload).toString(),
  ) as TokenResponse;

  await setUp.simAws.backgroundTasksComplete();

  return tokens;
}

/**
 * Assert an exchange came back with the three tokens the grant issues.
 */
function assertTokens(tokens: TokenResponse): void {
  assertUndefined(tokens.error);
  assertIdentical(tokens.token_type, "Bearer");
  assertNonNullable(tokens.id_token);
  assertNonNullable(tokens.access_token);
  assertNonNullable(tokens.refresh_token);
}

describe("A sim Lambda exchanging an authorization code", () => {
  it("reaches the pool's prefix domain with fetch", async () => {
    // Given a signed-in user and the code the browser carried to the callback.
    const setUp = await simCognitoHosted({ generateSecret: true });
    const code = await simCognitoAuthorizationCode(setUp);

    // When the bound handler exchanges it with fetch, at the hostname real
    // Cognito serves the prefix domain on.
    await deployExchanger(setUp, fetchExchangeHandler(setUp));
    const tokens = await exchangedTokens(setUp, code);

    // Then the simulation answered, rather than the request leaving for the
    // real hostname.
    assertTokens(tokens);
  });

  it("reaches the pool's prefix domain through node:https", async () => {
    // Given the same code, and a handler written without the Fetch API.
    const setUp = await simCognitoHosted({ generateSecret: true });
    const code = await simCognitoAuthorizationCode(setUp);

    // When the bound handler exchanges it.
    await deployExchanger(setUp, httpsExchangeHandler(setUp));
    const tokens = await exchangedTokens(setUp, code);

    // Then the same exchange is answered whichever client made it.
    assertTokens(tokens);
  });

  it("reaches a custom domain with fetch", async () => {
    // Given a pool served on a domain of the application's own, which says
    // nothing about being a Cognito hostname at all.
    const setUp = await simCognitoHosted({
      generateSecret: true,
      domain: "auth.example.com",
    });
    const code = await simCognitoAuthorizationCode(setUp);

    // When the bound handler exchanges the code there.
    await deployExchanger(setUp, fetchExchangeHandler(setUp));
    const tokens = await exchangedTokens(setUp, code);

    // Then the simulation answered for that hostname too.
    assertTokens(tokens);
  });

  it("reaches a custom domain through node:https", async () => {
    // Given the same pool and code.
    const setUp = await simCognitoHosted({
      generateSecret: true,
      domain: "auth.example.com",
    });
    const code = await simCognitoAuthorizationCode(setUp);

    // When the bound handler exchanges it without the Fetch API.
    await deployExchanger(setUp, httpsExchangeHandler(setUp));
    const tokens = await exchangedTokens(setUp, code);

    // Then that answers too.
    assertTokens(tokens);
  });

  it("carries a refusal back as the response it is", async () => {
    // Given a code the pool has already spent, since a code is good once.
    const setUp = await simCognitoHosted({ generateSecret: true });
    const code = await simCognitoAuthorizationCode(setUp);
    await deployExchanger(setUp, fetchExchangeHandler(setUp));
    await exchangedTokens(setUp, code);

    // When the handler exchanges it a second time.
    const tokens = await exchangedTokens(setUp, code);

    // Then the handler reads what real Cognito would have answered with.
    assertNonNullable(tokens.error);
    assertStringIncludes(tokens.error, "invalid_grant");
  });
});
