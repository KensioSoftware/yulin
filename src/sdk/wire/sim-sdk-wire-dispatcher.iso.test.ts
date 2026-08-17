import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeNumber,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkWireDispatcher } from "./sim-sdk-wire-dispatcher.js";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "./sim-sdk-wire.types.js";

/**
 * A signed request as an AWS SDK puts one on the wire.
 *
 * The Authorization header carries the credential scope, which is where the
 * request says the Region and the service it was signed for.
 */
function wireRequest(
  target: string,
  input: unknown,
  regionName = "eu-west-2",
  signingName = "dynamodb",
): SimSdkWireRequest {
  return {
    method: "POST",
    hostname: `${signingName}.${regionName}.amazonaws.com`,
    path: "/",
    headers: Object.fromEntries([
      ["x-amz-target", target],
      ["content-type", "application/x-amz-json-1.0"],
      [
        "authorization",
        "AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260817/" +
          `${regionName}/${signingName}/aws4_request, SignedHeaders=host, ` +
          "Signature=abc123",
      ],
    ]),
    body: Buffer.from(JSON.stringify(input)),
  };
}

function responseBody(response: SimSdkWireResponse): Record<string, unknown> {
  return JSON.parse(Buffer.from(response.body).toString()) as Record<
    string,
    unknown
  >;
}

async function simAwsWithOrder(): Promise<SimAws> {
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: "order-1" }, total: { N: "42" } },
    }),
  );

  return simAws;
}

describe("simulated AWS SDK wire dispatch", () => {
  it("answers a serialized Command from the simulation", async () => {
    // Given a simulated table holding an item.
    const simAws = await simAwsWithOrder();
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When the request an SDK would have serialized for it is dispatched.
    const response = await dispatcher.dispatch(
      wireRequest("DynamoDB_20120810.GetItem", {
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then the operation answered as the service would have on the wire.
    assertIdentical(response.statusCode, 200);
    assertIdentical(
      response.headers["content-type"],
      "application/x-amz-json-1.0",
    );
    assertObjectMatches(responseBody(response), {
      Item: { orderId: { S: "order-1" }, total: { N: "42" } },
    });

    await simAws.backgroundTasksComplete();
  });

  it("answers a refused operation as the failure the SDK reads", async () => {
    // Given a simulation with no such table.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an operation the service refuses is dispatched.
    const response = await dispatcher.dispatch(
      wireRequest("DynamoDB_20120810.GetItem", {
        TableName: "missing",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then the response carries the exception name in both places the SDK
    // looks for it, with the status real DynamoDB answers.
    assertIdentical(response.statusCode, 400);
    assertIdentical(
      response.headers["x-amzn-errortype"],
      "ResourceNotFoundException",
    );
    assertObjectMatches(responseBody(response), {
      __type: "ResourceNotFoundException",
    });

    await simAws.backgroundTasksComplete();
  });

  it("reads an operation that sends no request body", async () => {
    // Given a simulation with a table in it.
    const simAws = await simAwsWithOrder();
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an operation taking no input is dispatched, which an SDK sends
    // with an empty body.
    const response = await dispatcher.dispatch({
      ...wireRequest("DynamoDB_20120810.ListTables", {}),
      body: new Uint8Array(),
    });

    // Then the empty body read as the empty input it stands for.
    assertIdentical(response.statusCode, 200);
    assertObjectMatches(responseBody(response), { TableNames: ["orders"] });

    await simAws.backgroundTasksComplete();
  });

  it("answers an operation the simulated service does not support", async () => {
    // Given a simulation.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When a request naming an operation nothing routes is dispatched.
    const response = await dispatcher.dispatch(
      wireRequest("DynamoDB_20120810.ExportTableToPointInTime", {}),
    );

    // Then the SDK reads back an error naming the unsupported Command.
    assertIdentical(response.statusCode, 400);
    assertStringIncludes(
      String(responseBody(response)["message"]),
      "ExportTableToPointInTimeCommand",
    );

    await simAws.backgroundTasksComplete();
  });

  it("dispatches to the Region the request was signed for", async () => {
    // Given a table in a Region that is not the simulation's default.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    await simAws
      .accountRegionScope(undefined, "us-east-1")
      .dynamoDb()
      .createTable(
        new CreateTableCommand({
          TableName: "orders",
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When a request signed for that Region is dispatched.
    const response = await dispatcher.dispatch(
      wireRequest(
        "DynamoDB_20120810.DescribeTable",
        { TableName: "orders" },
        "us-east-1",
      ),
    );

    // Then it reached the table there rather than the default Region's.
    assertIdentical(response.statusCode, 200);

    await simAws.backgroundTasksComplete();
  });

  it("dispatches an unsigned request to the Region it was given", async () => {
    // Given a dispatcher told which Region the code sending requests runs in.
    const simAws = await simAwsWithOrder();
    const dispatcher = new SimSdkWireDispatcher(simAws, "eu-west-2");

    // When a request carrying no signature to read a scope from arrives.
    const response = await dispatcher.dispatch({
      ...wireRequest("DynamoDB_20120810.ListTables", {}),
      headers: Object.fromEntries([
        ["x-amz-target", "DynamoDB_20120810.ListTables"],
      ]),
    });

    // Then it was answered in that Region.
    assertObjectMatches(responseBody(response), { TableNames: ["orders"] });

    await simAws.backgroundTasksComplete();
  });

  it("encodes timestamps and binary as the protocol carries them", async () => {
    // Given an item with a binary attribute, and a table with a creation time.
    const simAws = await simAwsWithOrder();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: {
          orderId: { S: "order-2" },
          receipt: { B: new Uint8Array([1, 2, 3]) },
        },
      }),
    );
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When the item and the table are read over the wire.
    const item = responseBody(
      await dispatcher.dispatch(
        wireRequest("DynamoDB_20120810.GetItem", {
          TableName: "orders",
          Key: { orderId: { S: "order-2" } },
        }),
      ),
    );
    const table = responseBody(
      await dispatcher.dispatch(
        wireRequest("DynamoDB_20120810.DescribeTable", {
          TableName: "orders",
        }),
      ),
    );

    // Then binary is base64 and the timestamp is epoch seconds, which is what
    // the SDK reading this back decodes them from.
    assertObjectMatches(item, { Item: { receipt: { B: "AQID" } } });
    const creationTime = (table["Table"] as Record<string, unknown>)[
      "CreationDateTime"
    ];
    assertTypeNumber(creationTime);

    await simAws.backgroundTasksComplete();
  });

  it("refuses a request whose service has no serialized routing", async () => {
    // Given a simulation.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When a request carrying no operation header is dispatched, as every
    // protocol other than the AWS JSON ones sends.
    const request: SimSdkWireRequest = {
      ...wireRequest("unused", {}, "eu-west-2", "s3"),
      headers: Object.fromEntries([
        [
          "authorization",
          "AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260817/eu-west-2/s3/" +
            "aws4_request, SignedHeaders=host, Signature=abc123",
        ],
      ]),
    };
    const error = await assertThrowsErrorAsync(
      async () => await dispatcher.dispatch(request),
    );

    // Then the refusal names the service and says what to do instead.
    assertStringIncludes(error.message, "s3");
    assertStringIncludes(error.message, "AWS JSON protocol");

    await simAws.backgroundTasksComplete();
  });

  it("names the endpoint when an unroutable request is not signed", async () => {
    // Given a simulation.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const dispatcher = new SimSdkWireDispatcher(simAws);

    // When an unsigned request the bridge cannot route is dispatched.
    const error = await assertThrowsErrorAsync(
      async () =>
        await dispatcher.dispatch({
          method: "GET",
          hostname: "sts.eu-west-2.amazonaws.com",
          path: "/",
          headers: {},
          body: new Uint8Array(),
        }),
    );

    // Then the endpoint stands in for the service the scope would have named.
    assertStringIncludes(error.message, "sts.eu-west-2.amazonaws.com");

    await simAws.backgroundTasksComplete();
  });
});
