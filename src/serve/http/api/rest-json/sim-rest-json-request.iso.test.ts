import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  readSimRestJsonBody,
  readSimRestJsonRequest,
  simRestJsonPathSegments,
} from "./sim-rest-json-request.js";

/**
 * Reading a REST-JSON request, which states its operation in a path and its
 * input in a JSON body.
 */
describe("reading a REST-JSON request", () => {
  it("takes the path apart into the segments a route is matched on", () => {
    // Given a request naming an operation in its path
    const request = new Request(
      "http://localhost:1234/2015-03-31/functions/orders/invocations",
      { method: "POST" },
    );

    // When it is read as the REST-JSON request it is
    const read = readSimRestJsonRequest(request, Buffer.from("{}"));

    // Then the method and the segments are both there to match on, and the
    // path it arrived as is kept for naming one no route serves
    assertIdentical(read.method, "POST");
    assertIdentical(read.path, "/2015-03-31/functions/orders/invocations");
    assertArrayEquals(read.segments, [
      "2015-03-31",
      "functions",
      "orders",
      "invocations",
    ]);
  });

  it("decodes each segment on its own", () => {
    // Given a path label carrying characters a URL encodes, as a function ARN
    // does
    const segments = simRestJsonPathSegments(
      "/2015-03-31/functions/arn%3Aaws%3Alambda%3Aus-east-1%3A1%3Afunction%3Ao",
    );

    // Then the label arrived as the caller wrote it, in one segment
    assertArrayEquals(segments, [
      "2015-03-31",
      "functions",
      "arn:aws:lambda:us-east-1:1:function:o",
    ]);
  });

  it("reads a path ending in a separator as the same path", () => {
    // Given the two ways AWS writes the path of a collection operation
    assertArrayEquals(
      simRestJsonPathSegments("/2015-03-31/event-source-mappings"),
      ["2015-03-31", "event-source-mappings"],
    );
    assertArrayEquals(
      simRestJsonPathSegments("/2015-03-31/event-source-mappings/"),
      ["2015-03-31", "event-source-mappings"],
    );
  });

  it("reads an operation that sent no body as one taking no members", () => {
    assertObjectEquals(readSimRestJsonBody(new Uint8Array()), {});
  });

  it("reads a body as the members it states", () => {
    assertObjectEquals(
      readSimRestJsonBody(Buffer.from('{"FunctionName":"orders"}')),
      { FunctionName: "orders" },
    );
  });

  it("refuses a body that states itself as JSON and is not", () => {
    // Given a body that is not JSON at all
    const error = assertThrowsError(() =>
      readSimRestJsonBody(Buffer.from("not json")),
    );

    // Then it is refused under the name real AWS refuses it with
    assertIdentical(error.name, "SerializationException");
  });

  it("refuses a body that is JSON but not an object", () => {
    // Given a body holding a JSON value with no members to read
    const error = assertThrowsError(() =>
      readSimRestJsonBody(Buffer.from("[1, 2]")),
    );

    assertIdentical(error.name, "SerializationException");
  });
});
