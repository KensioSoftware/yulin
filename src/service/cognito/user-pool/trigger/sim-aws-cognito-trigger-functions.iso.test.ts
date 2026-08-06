import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";
import { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import {
  simAwsCognitoTriggerFunctions,
  SimAwsCognitoTriggerFunctions,
} from "./sim-aws-cognito-trigger-functions.js";
import { SimCognitoNoTriggerFunctions } from "./sim-cognito-trigger-functions.js";

const userPoolArn =
  "arn:aws:cognito-idp:us-east-1:888888888888:userpool/us-east-1_aBcDeFgHi";

function request(functionArn: string): {
  functionArn: string;
  userPoolArn: string;
  userPoolAccountId: string;
} {
  return { functionArn, userPoolArn, userPoolAccountId: "888888888888" };
}

describe("Simulated Lambda functions as Cognito user pool triggers", () => {
  it("refuses an ARN that is not a Lambda function", () => {
    // Given a simulation.
    const functions = simAwsCognitoTriggerFunctions(new SimAws());

    // When a trigger names a Lambda layer rather than a function.
    const refusal = functions.invokeRefusal(
      request("arn:aws:lambda:us-east-1:888888888888:layer:shared"),
    );

    // Then it is refused for what it is.
    assertNonNullable(refusal);
    assertStringIncludes(refusal, "is not a Lambda function ARN");
  });

  it("refuses a function version or alias", () => {
    // Given a simulation.
    const functions = new SimAwsCognitoTriggerFunctions({
      simAws: new SimAws(),
    });

    // When a trigger names a published version rather than the function.
    const refusal = functions.invokeRefusal(
      request("arn:aws:lambda:us-east-1:888888888888:function:pre-auth:PROD"),
    );

    // Then it is refused rather than run against `$LATEST`, which is a
    // different function to the one the pool named.
    assertNonNullable(refusal);
    assertStringIncludes(refusal, "names a function version or alias");
  });

  it("refuses to invoke a function that is not there", async () => {
    // Given a simulation with no functions in it.
    const functions = simAwsCognitoTriggerFunctions(new SimAws());

    // When one is invoked anyway, which a trigger only reaches if the function
    // went away between the check and the invocation.
    const error = await assertThrowsErrorAsync(async () =>
      functions.invoke(
        request("arn:aws:lambda:us-east-1:888888888888:function:pre-auth"),
        { request: {} },
      ),
    );

    // Then the missing function is reported rather than silently skipped.
    assertStringIncludes(error.message, "not a simulated Lambda function");
  });

  it("says a standalone Cognito has no Lambda to reach", async () => {
    // Given a Cognito built on its own rather than through SimAws, with a pool
    // naming a trigger. The pool is created without complaint, because nothing
    // is resolved until the trigger fires.
    const cognito = new SimCognitoIdentityProvider();
    const pool = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        LambdaConfig: {
          PreAuthentication:
            "arn:aws:lambda:us-east-1:888888888888:function:pre-auth",
        },
      }),
    );

    assertNonNullable(pool.UserPool?.Id);

    const client = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: pool.UserPool.Id,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      }),
    );

    const clientId = client.UserPoolClient?.ClientId;

    assertNonNullable(clientId);

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.UserPool.Id,
        Username: "alice",
      }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: pool.UserPool.Id,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // When the user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
        }),
      ),
    );

    // Then the sign-in says why the trigger could not run, and how to make it
    // able to.
    assertIdentical(error.name, "UnexpectedLambdaException");
    assertStringIncludes(error.message, "without simulated Lambda");
    assertStringIncludes(error.message, "Reach Cognito through SimAws");
  });

  it("refuses to invoke from a standalone Cognito too", async () => {
    // Given the trigger functions a standalone Cognito is built with.
    const functions = new SimCognitoNoTriggerFunctions();

    // When one is invoked, which nothing reaches while the refusal is checked
    // first, and which has to refuse rather than resolve if anything ever does.
    const error = await assertThrowsErrorAsync(async () =>
      functions.invoke(
        request("arn:aws:lambda:us-east-1:888888888888:function:pre-auth"),
      ),
    );

    assertStringIncludes(error.message, "without simulated Lambda");
  });

  it("has no refusal for a function in another Region that admits the pool", async () => {
    // Given a function in a Region the pool does not live in, granting Cognito
    // the invoke action for that pool.
    const simAws = new SimAws({ defaultAccountId: "888888888888" });
    const lambda = simAws.account("888888888888").region("eu-west-2").lambda();

    await lambda.createFunction({
      input: {
        FunctionName: "pre-auth",
        Role: "arn:aws:iam::888888888888:role/PreAuthRole",
        Code: { ZipFile: makeLambdaZipFileInput((event: unknown) => event) },
      },
    });
    await lambda.addPermission({
      input: {
        FunctionName: "pre-auth",
        StatementId: "AllowCognito",
        Action: "lambda:InvokeFunction",
        Principal: "cognito-idp.amazonaws.com",
        SourceArn: userPoolArn,
      },
    });

    // When the pool asks whether it may invoke it.
    const refusal = simAwsCognitoTriggerFunctions(simAws).invokeRefusal(
      request("arn:aws:lambda:eu-west-2:888888888888:function:pre-auth"),
    );

    // Then there is nothing to say: the lookup follows the ARN across Regions,
    // as a real LambdaConfig may name one.
    assertUndefined(refusal);
  });
});
