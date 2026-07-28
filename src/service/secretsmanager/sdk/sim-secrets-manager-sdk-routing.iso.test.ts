import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  RestoreSecretCommand,
  SecretsManagerClient,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeLambdaCodeZip } from "../../lambda/function/code/make-lambda-code-zip.js";

const emptyBytes = new Uint8Array();

describe("Secrets Manager SDK interception", () => {
  it("routes an intercepted SecretsManagerClient to simulated Secrets Manager", async () => {
    // Given an intercepted Secrets Manager SDK client.
    const simSdk = new SimSdk();
    simSdk.intercept(SecretsManagerClient);

    const client = new SecretsManagerClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a secret and reads it back.
    await client.send(
      new CreateSecretCommand({
        Name: "db-creds",
        SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
      }),
    );
    const read = await client.send(
      new GetSecretValueCommand({ SecretId: "db-creds" }),
    );
    const listed = await client.send(new ListSecretsCommand({}));

    // Then it all works with nothing touching the network.
    assertNonNullable(read.SecretString);
    assertStringIncludes(read.SecretString, "hunter2");
    assertIdentical(listed.SecretList?.at(0)?.Name, "db-creds");

    simSdk.restoreAll();
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted Secrets Manager SDK client.
    const simSdk = new SimSdk();
    simSdk.intercept(SecretsManagerClient);

    const client = new SecretsManagerClient({ region: "eu-west-2" });
    await client.send(
      new CreateSecretCommand({ Name: "db-creds", SecretString: "first" }),
    );

    // When each of the remaining operations is used.
    await client.send(
      new PutSecretValueCommand({
        SecretId: "db-creds",
        SecretString: "second",
      }),
    );
    await client.send(
      new UpdateSecretCommand({
        SecretId: "db-creds",
        Description: "Application database credentials",
      }),
    );
    const described = await client.send(
      new DescribeSecretCommand({ SecretId: "db-creds" }),
    );
    await client.send(new DeleteSecretCommand({ SecretId: "db-creds" }));
    const restored = await client.send(
      new RestoreSecretCommand({ SecretId: "db-creds" }),
    );

    // Then each one reached simulated Secrets Manager.
    assertIdentical(described.Description, "Application database credentials");
    assertIdentical(restored.Name, "db-creds");

    simSdk.restoreAll();
  });

  it("fetches a secret inside a Lambda handler as the execution Role", async () => {
    // Given a function whose code fetches a secret on invocation, running as a
    // Role allowed to read that secret.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-creds",
        SecretString: JSON.stringify({ password: "hunter2" }),
      }),
    );
    assertNonNullable(created.ARN);

    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReaderRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReaderRole",
        PolicyName: "ReadSecret",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "secretsmanager:GetSecretValue",
            // The ARN suffix has to be allowed for, exactly as on real AWS.
            Resource: `arn:aws:secretsmanager:us-east-1:${accountId}:secret:db-creds-??????`,
          },
        }),
      }),
    );

    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "secret-reader",
        Role: role.Role.Arn,
        Handler: "index.handler",
        Code: {
          ZipFile: makeLambdaCodeZip({
            "index.js":
              'const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");\n' +
              "exports.handler = async () => {\n" +
              "  const client = new SecretsManagerClient({});\n" +
              "  const out = await client.send(new GetSecretValueCommand({\n" +
              '    SecretId: "db-creds",\n' +
              "  }));\n" +
              "  return JSON.parse(out.SecretString).password;\n" +
              "};\n",
          }),
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "secret-reader" }));

    // Then the handler's own SDK call reached simulated Secrets Manager as the
    // execution Role, and that Role's policy allowed it.
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);
    assertStringIncludes(payload.toString("utf8"), "hunter2");
  });

  it("denies a Lambda handler whose Role may not read the secret", async () => {
    // Given the same function, running as a Role with no secret permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-creds",
        SecretString: JSON.stringify({ password: "hunter2" }),
      }),
    );

    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoSecretsRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "secret-reader",
        Role: role.Role.Arn,
        Handler: "index.handler",
        Code: {
          ZipFile: makeLambdaCodeZip({
            "index.js":
              'const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");\n' +
              "exports.handler = async () => {\n" +
              "  const client = new SecretsManagerClient({});\n" +
              "  const out = await client.send(new GetSecretValueCommand({\n" +
              '    SecretId: "db-creds",\n' +
              "  }));\n" +
              "  return JSON.parse(out.SecretString).password;\n" +
              "};\n",
          }),
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "secret-reader" }));

    // Then the handler fails the way it would on real AWS, rather than getting
    // the secret anyway.
    assertIdentical(invoked.FunctionError, "Unhandled");
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);
    assertStringIncludes(payload.toString("utf8"), "not authorized");
  });
});
