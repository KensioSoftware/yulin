import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  CreateQueueCommand,
  ListQueuesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../index.js";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * The general AWS service API over a real port, driven by real SDK clients
 * given nothing but an endpoint URL and credentials.
 *
 * This is the shape a non-Node client gets: no simulator import, no hostname
 * that says which service is being addressed, and an identity that has to come
 * from the signature.
 */
describe("Serving the general AWS API on one endpoint", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let credentials: { accessKeyId: string; secretAccessKey: string };
  let readOnlyCredentials: { accessKeyId: string; secretAccessKey: string };

  beforeAll(async () => {
    await simAws.dynamoDb().createTable(
      new CreateTableCommand({
        TableName: "widgets",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "jobs" }));

    credentials = await accessKeyFor("Spike", {
      Effect: "Allow",
      Action: "*",
      Resource: "*",
    });
    readOnlyCredentials = await accessKeyFor("ReadOnly", {
      Effect: "Allow",
      Action: "dynamodb:GetItem",
      Resource: "*",
    });

    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;
  });

  afterAll(async () => {
    await srv.close();
  });

  async function accessKeyFor(
    username: string,
    statement: object,
  ): Promise<{ accessKeyId: string; secretAccessKey: string }> {
    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: username }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "Spike",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: statement,
        }),
      }),
    );

    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    return {
      accessKeyId: created.AccessKey.AccessKeyId,
      secretAccessKey: created.AccessKey.SecretAccessKey,
    };
  }

  function dynamoDbClient(withCredentials = credentials): DynamoDBClient {
    return new DynamoDBClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: withCredentials,
    });
  }

  it("round-trips an Item for a client given only an endpoint URL", async () => {
    // Given a real DynamoDB client pointed at the local server
    const client = dynamoDbClient();

    // When it writes and reads an Item
    await client.send(
      new PutItemCommand({
        TableName: "widgets",
        Item: { id: { S: "w1" }, name: { S: "Widget one" } },
      }),
    );
    const got = await client.send(
      new GetItemCommand({ TableName: "widgets", Key: { id: { S: "w1" } } }),
    );

    // Then it reads back what it wrote
    assertIdentical(got.Item?.["name"]?.S, "Widget one");
  });

  it("routes two services through the same endpoint URL", async () => {
    // Given DynamoDB and SQS clients sharing one endpoint URL
    const dynamoDb = dynamoDbClient();
    const sqs = new SQSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials,
    });

    // When each lists its own resources
    const tables = await dynamoDb.send(new ListTablesCommand({}));
    const queues = await sqs.send(new ListQueuesCommand({}));

    // Then the credential scope routed each to its own simulated service
    assertIdentical(tables.TableNames?.[0], "widgets");
    assertStringIncludes(queues.QueueUrls?.[0] ?? "", "jobs");
  });

  it("refuses an operation the signing principal has no permission for", async () => {
    // Given a client signing as a principal allowed only to read
    const client = dynamoDbClient(readOnlyCredentials);

    // When it attempts a write
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new PutItemCommand({
            TableName: "widgets",
            Item: { id: { S: "denied" } },
          }),
        ),
    );

    // Then simulated IAM denied it, and the SDK surfaced the AWS error
    assertStringIncludes(error.message, "not authorized to perform");
    assertStringIncludes(error.message, "dynamodb:PutItem");
  });

  it("authorizes an assumed-role session against the Role behind it", async () => {
    // Given a Role allowed to write, and a session assumed into it whose own
    // session ARN owns no policies at all
    const accountId = simAws.defaultAccountId;

    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Writer",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Writer",
        PolicyName: "WriteWidgets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:PutItem",
            Resource: "*",
          },
        }),
      }),
    );

    const assumed = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Writer`,
        RoleSessionName: "served",
      }),
    );

    const session = assumed.Credentials;
    assertDefined(session, "assumed session credentials");

    // When the session signs a write against the served endpoint
    const client = new DynamoDBClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: session.AccessKeyId ?? "",
        secretAccessKey: session.SecretAccessKey ?? "",
        sessionToken: session.SessionToken ?? "",
      },
    });

    await client.send(
      new PutItemCommand({
        TableName: "widgets",
        Item: { id: { S: "by-session" } },
      }),
    );

    // Then the Role's policy allowed it, which the session ARN alone could not
    const written = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "widgets",
        Key: { id: { S: "by-session" } },
      }),
    );

    assertIdentical(written.Item?.["id"]?.S, "by-session");
  });

  it("refuses a protocol it cannot read without asking the client to retry", async () => {
    // Given a request signed for the Lambda control plane, which speaks
    // REST-JSON rather than any protocol this endpoint reads
    const client = new LambdaClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials,
      maxAttempts: 1,
    });

    // When it asks for something only REST-JSON could express
    const error = await assertThrowsErrorAsync(
      async () => await client.send(new ListFunctionsCommand({})),
    );

    // Then it is refused as unimplemented, which an SDK does not retry, and
    // the reason travels with the refusal
    assertIdentical(
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode,
      501,
    );
  });

  it("serves an unsigned request nothing, rather than serving it as an administrator", async () => {
    // Given a request carrying no signature at all
    const response = await fetch(`${endpoint}/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": "DynamoDB_20120810.ListTables",
      },
      body: "{}",
    });

    // Then the endpoint declines it, because an unsigned request names no
    // service to route to
    assertIdentical(response.status, 501);
  });
});
