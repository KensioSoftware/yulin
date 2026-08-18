import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simLambdaOutboundWireRequest,
  simLambdaOutboundWireResponse,
} from "./sim-lambda-outbound-wire.js";

describe("sim Lambda outbound requests on the wire", () => {
  it("reads a request as the AWS API request it is", async () => {
    // Given a request an SDK addressed to a service endpoint.
    const request = new Request(
      "https://dynamodb.eu-west-2.amazonaws.com/?limit=1",
      {
        method: "POST",
        headers: { "X-Amz-Target": "DynamoDB_20120810.GetItem" },
        body: '{"TableName":"orders"}',
      },
    );

    // When it is read for the wire dispatcher.
    const wireRequest = await simLambdaOutboundWireRequest(request);

    // Then it says where it was addressed, with the header names in the case
    // the dispatcher looks them up by.
    assertIdentical(wireRequest.method, "POST");
    assertIdentical(wireRequest.hostname, "dynamodb.eu-west-2.amazonaws.com");
    assertIdentical(wireRequest.path, "/?limit=1");
    assertIdentical(
      wireRequest.headers["x-amz-target"],
      "DynamoDB_20120810.GetItem",
    );
    assertIdentical(
      Buffer.from(wireRequest.body).toString(),
      '{"TableName":"orders"}',
    );
  });

  it("presents an answer as the response a client reads", async () => {
    // Given the answer the wire dispatcher gave.
    const response = simLambdaOutboundWireResponse({
      statusCode: 400,
      headers: { "content-type": "application/x-amz-json-1.0" },
      body: Buffer.from('{"__type":"ResourceNotFoundException"}'),
    });

    // Then it reads back as the response it was.
    assertIdentical(response.status, 400);
    assertIdentical(
      response.headers.get("content-type"),
      "application/x-amz-json-1.0",
    );
    assertIdentical(
      await response.text(),
      '{"__type":"ResourceNotFoundException"}',
    );
  });

  it("presents an answer carrying nothing as a response with no body", () => {
    // Given an answer with an empty body, as the statuses that carry none
    // have.
    const response = simLambdaOutboundWireResponse({
      statusCode: 204,
      headers: {},
      body: new Uint8Array(),
    });

    // Then the response is built without one rather than refused.
    assertIdentical(response.status, 204);
    assertTrue(response.body === null);
  });
});
