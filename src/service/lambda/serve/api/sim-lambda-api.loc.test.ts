import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionCommand,
  DeleteFunctionUrlConfigCommand,
  GetFunctionCommand,
  GetFunctionUrlConfigCommand,
  GetPolicyCommand,
  InvokeCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
  ListFunctionUrlConfigsCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";

/**
 * Simulated Lambda reached the way a client outside the process reaches it: an
 * endpoint URL, credentials, and no simulator in sight.
 *
 * Lambda speaks REST-JSON rather than the AWS JSON protocol most of the served
 * services speak, so what these cover is whether an operation survives the
 * round trip through a method, a path, a JSON body and, for an invoke, a
 * payload carried as the body in both directions.
 */
describe("Serving the simulated Lambda control plane on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: LambdaClient;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Deployer" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Deployer",
        PolicyName: "Everything",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Deployer" }),
    );

    client = new LambdaClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  /**
   * A real zip archive, since a function created over the endpoint sends its
   * code as base64 in a JSON body rather than handing over a handler the
   * process already holds.
   */
  const echoCodeZip = makeLambdaCodeZip(
    "exports.handler = async (event) => {\n" +
      "  if (event.fail !== undefined) {\n" +
      "    throw new Error(event.fail);\n" +
      "  }\n" +
      "  return { echoed: event };\n" +
      "};",
  );

  /**
   * Create a function over the endpoint, whose handler echoes what it was
   * given, or throws when asked to.
   */
  async function createEchoFunction(functionName: string): Promise<void> {
    await client.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: "arn:aws:iam::888888888888:role/EchoRole",
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: { ZipFile: echoCodeZip },
      }),
    );
  }

  it("creates a function from a zip carried as JSON", async () => {
    // Given nothing but an endpoint URL and credentials

    // When a function is created over it
    await createEchoFunction("orders");

    // Then the simulation holds it, and reports it back over the same endpoint
    const read = await client.send(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );
    assertDefined(read.Configuration, "a function configuration");
    assertIdentical(read.Configuration.FunctionName, "orders");
    assertIdentical(
      read.Configuration.Role,
      "arn:aws:iam::888888888888:role/EchoRole",
    );
  });

  it("invokes a function and answers with its payload", async () => {
    // Given a function reached over the endpoint
    await createEchoFunction("invoiced");

    // When it is invoked with a payload
    const invoked = await client.send(
      new InvokeCommand({
        FunctionName: "invoiced",
        Payload: JSON.stringify({ id: 1 }),
      }),
    );

    // Then the handler ran, and its result came back as the payload
    assertIdentical(invoked.StatusCode, 200);
    assertUndefined(invoked.FunctionError);
    assertDefined(invoked.Payload, "an invoke payload");
    assertIdentical(
      Buffer.from(invoked.Payload).toString(),
      JSON.stringify({ echoed: { id: 1 } }),
    );
  });

  it("reports a handler failure with the function error header", async () => {
    // Given a function whose handler throws for this event
    await createEchoFunction("failing");

    // When it is invoked
    const invoked = await client.send(
      new InvokeCommand({
        FunctionName: "failing",
        Payload: JSON.stringify({ fail: "no stock" }),
      }),
    );

    // Then the invocation succeeded and the failure is reported as one
    assertIdentical(invoked.StatusCode, 200);
    assertIdentical(invoked.FunctionError, "Unhandled");
    assertDefined(invoked.Payload, "an invoke payload");
    assertStringIncludes(Buffer.from(invoked.Payload).toString(), "no stock");
  });

  it("answers an asynchronous invocation before the handler runs", async () => {
    // Given a function reached over the endpoint
    await createEchoFunction("queued");

    // When it is invoked without waiting for a result
    const invoked = await client.send(
      new InvokeCommand({
        FunctionName: "queued",
        InvocationType: "Event",
        Payload: JSON.stringify({ id: 2 }),
      }),
    );

    // Then the answer is the accepted status and nothing else
    assertIdentical(invoked.StatusCode, 202);
    await simAws.backgroundTasksComplete();
  });

  it("raises a missing function under the name real Lambda gives it", async () => {
    // Given no function of this name

    // When one is invoked anyway
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new InvokeCommand({ FunctionName: "absent" })),
    );

    // Then the SDK raised the exception rather than failing to read the answer
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, "Function not found");
  });

  it("serves the resource policy operations", async () => {
    // Given a function reached over the endpoint
    await createEchoFunction("shared");

    // When a statement is added to its policy
    const added = await client.send(
      new AddPermissionCommand({
        FunctionName: "shared",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
      }),
    );

    // Then the statement it assembled comes back, and the policy holds it
    assertStringIncludes(added.Statement ?? "", "s3.amazonaws.com");

    const policy = await client.send(
      new GetPolicyCommand({ FunctionName: "shared" }),
    );
    assertStringIncludes(policy.Policy ?? "", "AllowS3");
  });

  it("serves the Function URL configuration operations", async () => {
    // Given a function reached over the endpoint
    await createEchoFunction("public");

    // When a Function URL is configured for it
    const created = await client.send(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "public",
        AuthType: "NONE",
      }),
    );
    assertStringIncludes(created.FunctionUrl ?? "", "lambda-url");

    // Then it is read back at its own path, and at the listing beside it
    const read = await client.send(
      new GetFunctionUrlConfigCommand({ FunctionName: "public" }),
    );
    assertIdentical(read.AuthType, "NONE");

    const listed = await client.send(
      new ListFunctionUrlConfigsCommand({ FunctionName: "public" }),
    );
    assertArrayLength(listed.FunctionUrlConfigs ?? [], 1);

    // And deleting it answers with the empty response real Lambda answers with
    await client.send(
      new DeleteFunctionUrlConfigCommand({ FunctionName: "public" }),
    );
    const gone = await client.send(
      new ListFunctionUrlConfigsCommand({ FunctionName: "public" }),
    );
    assertArrayLength(gone.FunctionUrlConfigs ?? [], 0);
  });

  it("lists the event source mappings of a function", async () => {
    // Given a function with no event source mapping
    await createEchoFunction("unmapped");

    // When its mappings are listed
    const listed = await client.send(
      new ListEventSourceMappingsCommand({ FunctionName: "unmapped" }),
    );

    // Then the listing is empty rather than absent
    assertArrayLength(listed.EventSourceMappings ?? [], 0);
  });

  it("deletes a function", async () => {
    // Given a function reached over the endpoint
    await createEchoFunction("temporary");

    // When it is deleted
    await client.send(new DeleteFunctionCommand({ FunctionName: "temporary" }));

    // Then it is gone
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new GetFunctionCommand({ FunctionName: "temporary" }),
        ),
    );
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});
