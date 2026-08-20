import {
  assertBufferEqual,
  assertIdentical,
  assertObjectEquals,
  assertObjectMatches,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";

import { SimRestJsonInput } from "../../../../serve/http/api/rest-json/sim-rest-json-input.js";
import { readSimRestJsonRequest } from "../../../../serve/http/api/rest-json/sim-rest-json-request.js";
import { resolveSimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-routes.js";
import { simLambdaApiRoutes } from "./sim-lambda-api-routes.js";

interface RequestParts {
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

/**
 * Which Lambda operation a request names, which REST-JSON states in the method
 * and the path rather than in a header.
 */
describe("Resolving a Lambda operation from a served request", () => {
  function match(method: string, path: string, parts: RequestParts = {}) {
    const request = new Request(`http://localhost:1234${path}`, {
      method,
      ...(parts.headers !== undefined && { headers: parts.headers }),
    });
    const body = Buffer.from(parts.body ?? "");

    return {
      matched: resolveSimRestJsonRoute(
        simLambdaApiRoutes,
        readSimRestJsonRequest(request, body),
      ),
      request,
      body,
    };
  }

  function command(
    method: string,
    path: string,
    parts: RequestParts = {},
  ): string | undefined {
    return match(method, path, parts).matched?.route.commandName;
  }

  /**
   * The input one of these routes reads out of a request it serves.
   */
  function input(
    method: string,
    path: string,
    parts: RequestParts = {},
  ): Record<string, unknown> {
    const { matched, request, body } = match(method, path, parts);
    assertDefined(matched, `a route for ${method} ${path}`);

    return matched.route.input(
      new SimRestJsonInput({
        labels: matched.labels,
        query: new URL(request.url).searchParams,
        headers: request.headers,
        body,
      }),
    );
  }

  it("routes the function operations", () => {
    assertIdentical(
      command("POST", "/2015-03-31/functions"),
      "CreateFunctionCommand",
    );
    assertIdentical(
      command("GET", "/2015-03-31/functions/orders"),
      "GetFunctionCommand",
    );
    assertIdentical(
      command("DELETE", "/2015-03-31/functions/orders"),
      "DeleteFunctionCommand",
    );
    assertIdentical(
      command("POST", "/2015-03-31/functions/orders/invocations"),
      "InvokeCommand",
    );
    assertIdentical(
      command("GET", "/2015-03-31/functions"),
      "ListFunctionsCommand",
    );
    assertIdentical(
      command("PUT", "/2015-03-31/functions/orders/code"),
      "UpdateFunctionCodeCommand",
    );
    assertIdentical(
      command("PUT", "/2015-03-31/functions/orders/configuration"),
      "UpdateFunctionConfigurationCommand",
    );
  });

  it("routes the Function URL configuration operations", () => {
    const path = "/2021-10-31/functions/orders/url";

    assertIdentical(command("POST", path), "CreateFunctionUrlConfigCommand");
    assertIdentical(command("GET", path), "GetFunctionUrlConfigCommand");
    assertIdentical(command("PUT", path), "UpdateFunctionUrlConfigCommand");
    assertIdentical(command("DELETE", path), "DeleteFunctionUrlConfigCommand");
    assertIdentical(
      command("GET", "/2021-10-31/functions/orders/urls"),
      "ListFunctionUrlConfigsCommand",
    );
  });

  it("routes the resource policy operations", () => {
    assertIdentical(
      command("POST", "/2015-03-31/functions/orders/policy"),
      "AddPermissionCommand",
    );
    assertIdentical(
      command("GET", "/2015-03-31/functions/orders/policy"),
      "GetPolicyCommand",
    );
    assertIdentical(
      command("DELETE", "/2015-03-31/functions/orders/policy/AllowS3"),
      "RemovePermissionCommand",
    );
  });

  it("routes the event source mapping operations", () => {
    assertIdentical(
      command("POST", "/2015-03-31/event-source-mappings"),
      "CreateEventSourceMappingCommand",
    );
    assertIdentical(
      command("GET", "/2015-03-31/event-source-mappings"),
      "ListEventSourceMappingsCommand",
    );
    assertIdentical(
      command("GET", "/2015-03-31/event-source-mappings/a-uuid"),
      "GetEventSourceMappingCommand",
    );
    assertIdentical(
      command("DELETE", "/2015-03-31/event-source-mappings/a-uuid"),
      "DeleteEventSourceMappingCommand",
    );
  });

  it("has no operation for a path this endpoint does not serve", () => {
    // Given the paths of Lambda operations this simulation has not
    // implemented, each sharing its method with one it has
    // Then none of them resolves to the operation beside it
    assertUndefined(command("POST", "/2015-03-31/functions/orders/versions"));
    assertUndefined(
      command("GET", "/2015-03-31/functions/orders/configuration"),
    );
    assertUndefined(
      command("GET", "/2015-03-31/functions/orders/aliases/live"),
    );
    assertUndefined(command("GET", "/2019-09-30/functions/orders/concurrency"));
  });

  it("reads the function or the mapping a path names", () => {
    // Given the operations whose whole input is the resource in the path
    // Then each reads it out of the label its template named
    const named = { FunctionName: "orders" };

    assertObjectEquals(input("GET", "/2015-03-31/functions/orders"), named);
    assertObjectEquals(input("DELETE", "/2015-03-31/functions/orders"), named);
    assertObjectEquals(
      input("GET", "/2015-03-31/functions/orders/policy"),
      named,
    );
    assertObjectEquals(input("GET", "/2021-10-31/functions/orders/url"), named);
    assertObjectEquals(
      input("DELETE", "/2021-10-31/functions/orders/url"),
      named,
    );
    assertObjectEquals(
      input("GET", "/2021-10-31/functions/orders/urls"),
      named,
    );

    const mapping = { UUID: "a-uuid" };
    assertObjectEquals(
      input("GET", "/2015-03-31/event-source-mappings/a-uuid"),
      mapping,
    );
    assertObjectEquals(
      input("DELETE", "/2015-03-31/event-source-mappings/a-uuid"),
      mapping,
    );
  });

  it("reads the version listing a query asked for", () => {
    // Given a listing whose only member travels in the query string
    assertObjectEquals(input("GET", "/2015-03-31/functions"), {
      FunctionVersion: undefined,
    });
    assertObjectEquals(
      input("GET", "/2015-03-31/functions?FunctionVersion=ALL"),
      { FunctionVersion: "ALL" },
    );
  });

  it("reads replacement code from both the path and the body", () => {
    // Given an UpdateFunctionCode request, whose zip travels base64 encoded
    // the way JSON has to carry bytes
    const zipFile = Buffer.from("a zip archive");
    const read = input("PUT", "/2015-03-31/functions/orders/code", {
      body: JSON.stringify({ ZipFile: zipFile.toString("base64") }),
    });

    assertIdentical(read["FunctionName"], "orders");
    assertBufferEqual(read["ZipFile"] as Uint8Array, zipFile);
  });

  it("reads a write from both the path and the body", () => {
    // Given the operations naming their function in the path and stating what
    // to write in the body
    assertObjectEquals(
      input("PUT", "/2015-03-31/functions/orders/configuration", {
        body: JSON.stringify({ Timeout: 5 }),
      }),
      { Timeout: 5, FunctionName: "orders" },
    );
    assertObjectEquals(
      input("POST", "/2021-10-31/functions/orders/url", {
        body: JSON.stringify({ AuthType: "NONE" }),
      }),
      { AuthType: "NONE", FunctionName: "orders" },
    );
    assertObjectEquals(
      input("PUT", "/2021-10-31/functions/orders/url", {
        body: JSON.stringify({ InvokeMode: "BUFFERED" }),
      }),
      { InvokeMode: "BUFFERED", FunctionName: "orders" },
    );
    assertObjectEquals(
      input("POST", "/2015-03-31/functions/orders/policy", {
        body: JSON.stringify({ StatementId: "AllowS3" }),
      }),
      { StatementId: "AllowS3", FunctionName: "orders" },
    );
  });

  it("reads a permission removal, whose statement is a second label", () => {
    assertObjectEquals(
      input("DELETE", "/2015-03-31/functions/orders/policy/AllowS3"),
      { FunctionName: "orders", StatementId: "AllowS3" },
    );
  });

  it("reads an invoke from the path, a header, the query and the body", () => {
    // Given an invocation naming its function in the path, its type in a
    // header, its qualifier in the query string and its payload in the body
    const read = input(
      "POST",
      "/2015-03-31/functions/orders/invocations?Qualifier=live",
      {
        headers: { "x-amz-invocation-type": "Event" },
        body: '{"id":1}',
      },
    );

    // Then every member came off the place REST-JSON puts it, and the payload
    // is the bytes that arrived rather than anything read out of them
    assertObjectMatches(read, {
      FunctionName: "orders",
      InvocationType: "Event",
      Qualifier: "live",
    });
    assertIdentical(
      Buffer.from(read["Payload"] as Uint8Array).toString(),
      '{"id":1}',
    );
  });

  it("refuses an invocation type real Lambda does not have", () => {
    // Given a request asking to be invoked in a way there is no such thing as
    const error = assertThrowsError(() =>
      input("POST", "/2015-03-31/functions/orders/invocations", {
        headers: { "x-amz-invocation-type": "Whenever" },
      }),
    );

    // Then it is refused by name rather than dispatched to nothing
    assertIdentical(error.name, "InvalidParameterValueException");
  });

  it("decodes the code a function is created with", () => {
    // Given a creation carrying its zip the way JSON carries bytes
    const zip = Buffer.from("PK pretend zip");
    const read = input("POST", "/2015-03-31/functions", {
      body: JSON.stringify({
        FunctionName: "orders",
        Code: { ZipFile: zip.toString("base64") },
      }),
    });

    // Then the simulation is handed the bytes rather than the base64 of them
    const code = read["Code"] as { ZipFile: Uint8Array };
    assertIdentical(Buffer.from(code.ZipFile).toString(), zip.toString());
  });

  it("leaves code that is not a zip as it was stated", () => {
    // Given a creation naming its code in S3 rather than carrying it
    const read = input("POST", "/2015-03-31/functions", {
      body: JSON.stringify({
        FunctionName: "orders",
        Code: { S3Bucket: "artifacts", S3Key: "orders.zip" },
      }),
    });

    assertObjectEquals(read["Code"] as object, {
      S3Bucket: "artifacts",
      S3Key: "orders.zip",
    });
  });

  it("reads a creation stating no code at all", () => {
    const read = input("POST", "/2015-03-31/functions", {
      body: JSON.stringify({ FunctionName: "orders" }),
    });

    assertObjectEquals(read, { FunctionName: "orders" });
  });

  it("reads a mapping's starting position back as a date", () => {
    // Given a mapping to start reading from a moment, which JSON carries as
    // epoch seconds
    const read = input("POST", "/2015-03-31/event-source-mappings", {
      body: JSON.stringify({
        FunctionName: "orders",
        StartingPosition: "AT_TIMESTAMP",
        StartingPositionTimestamp: 1_770_000_000,
      }),
    });

    // Then the simulation is handed the date it compares against
    const started = read["StartingPositionTimestamp"] as Date;
    assertIdentical(
      started.toISOString(),
      new Date(1_770_000_000_000).toISOString(),
    );
  });

  it("reads a mapping stating no starting position", () => {
    const read = input("POST", "/2015-03-31/event-source-mappings", {
      body: JSON.stringify({ FunctionName: "orders", BatchSize: 10 }),
    });

    assertObjectEquals(read, { FunctionName: "orders", BatchSize: 10 });
  });

  it("reads a mapping listing's filters out of the query string", () => {
    const read = input(
      "GET",
      "/2015-03-31/event-source-mappings?FunctionName=orders",
    );

    assertObjectEquals(read, {
      EventSourceArn: undefined,
      FunctionName: "orders",
    });
  });
});
