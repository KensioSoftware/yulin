import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { assertNonNullable, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import type { SimLambda } from "../../sim-lambda.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

async function invoke(
  simLambda: SimLambda,
  functionName: string,
): Promise<unknown> {
  const output = await simLambda.invoke(
    new InvokeCommand({ FunctionName: functionName, Payload: "{}" }),
  );
  assertNonNullable(output.Payload);
  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}

/**
 * A function declaring no variables of its own, backed by an in-process
 * handler, which is the case that runs on the host process environment.
 */
async function boundFunction(
  simAws: SimAws,
  handler: SimLambdaHandler,
  roleArn = `arn:aws:iam::${simAws.defaultAccountId}:role/ReaderRole`,
): Promise<SimLambda> {
  const simLambda = simAws.lambda();
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "reader",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  return simLambda;
}

describe("sim Lambda credentials and the host process environment", () => {
  it("keeps a host AWS_PROFILE out of the invocation", async () => {
    // Given a test process with an AWS profile selected, as a developer's
    // shell and a CI runner both often have.
    process.env["AWS_PROFILE"] = "engineering-sso";

    try {
      const simAws = new SimAws();
      const simLambda = await boundFunction(simAws, () => ({
        profile: process.env["AWS_PROFILE"] ?? null,
        accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? null,
      }));

      // When a function declaring no variables of its own is invoked.
      const result = await invoke(simLambda, "reader");

      // Then the handler sees the simulated execution credentials, and no
      // profile to send an SDK looking for the host's own.
      assertObjectEquals(result, {
        profile: null,
        accessKeyId: "ASIAYULINSIMULATED00",
      });
      assertNonNullable(process.env["AWS_PROFILE"]);
    } finally {
      delete process.env["AWS_PROFILE"];
    }
  });

  it("answers an SDK client the handler builds while a host AWS_PROFILE is set", async () => {
    // Given a simulated secret, and an execution Role allowed to read it.
    process.env["AWS_PROFILE"] = "engineering-sso";

    try {
      const simAws = new SimAws();
      const secret = await simAws.secretsManager().createSecret(
        new CreateSecretCommand({
          Name: "origin-key",
          SecretString: "s3cret",
        }),
      );
      assertNonNullable(secret.ARN);

      const role = await simIamRoleWithPolicyFactory.make(
        {
          roleName: "ReaderRole",
          policyName: "ReadOriginKey",
          actions: ["secretsmanager:GetSecretValue"],
          resource: secret.ARN,
        },
        simAws,
      );
      assertNonNullable(role.Arn);

      // And a handler building its own SDK client, as function code does.
      const simLambda = await boundFunction(
        simAws,
        async () => {
          const client = new SecretsManagerClient({});
          const held = await client.send(
            new GetSecretValueCommand({ SecretId: "origin-key" }),
          );

          return { secretString: held.SecretString ?? null };
        },
        role.Arn,
      );

      // When the function is invoked.
      const result = await invoke(simLambda, "reader");

      // Then the call reached simulated Secrets Manager, authorized as the
      // execution Role, with the host's profile playing no part in it.
      assertObjectEquals(result, { secretString: "s3cret" });
    } finally {
      delete process.env["AWS_PROFILE"];
    }
  });

  it("leaves every other host variable where the handler can read it", async () => {
    // Given a host process holding both an AWS profile and the configuration
    // an in-process handler reads.
    process.env["AWS_PROFILE"] = "engineering-sso";
    process.env["YULIN_TEST_DATABASE_URL"] = "postgres://localhost/widgets";

    try {
      const simAws = new SimAws();
      const simLambda = await boundFunction(simAws, () => ({
        databaseUrl: process.env["YULIN_TEST_DATABASE_URL"] ?? null,
        region: process.env["AWS_REGION"] ?? null,
      }));

      // When the function is invoked.
      const result = await invoke(simLambda, "reader");

      // Then only the credential variables were masked.
      assertObjectEquals(result, {
        databaseUrl: "postgres://localhost/widgets",
        region: simAws.defaultRegionName,
      });
    } finally {
      delete process.env["AWS_PROFILE"];
      delete process.env["YULIN_TEST_DATABASE_URL"];
    }
  });
});
