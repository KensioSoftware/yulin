import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { readSimRestJsonRequest } from "./sim-rest-json-request.js";
import type { SimRestJsonRoute } from "./sim-rest-json-route.type.js";
import { resolveSimRestJsonRoute } from "./sim-rest-json-routes.js";

/**
 * Which operation a REST-JSON request names, which the protocol states in the
 * method and the path rather than in a header.
 */
describe("Resolving a REST-JSON operation from a request", () => {
  const routes: readonly SimRestJsonRoute[] = [
    {
      method: "GET",
      path: "/v1/widgets/{WidgetId}",
      commandName: "GetWidgetCommand",
      input: (input) => ({ WidgetId: input.label("WidgetId") }),
    },
    {
      method: "POST",
      path: "/v1/widgets/{WidgetId}/parts",
      commandName: "AddPartCommand",
      input: (input) => ({ WidgetId: input.label("WidgetId") }),
    },
    {
      method: "POST",
      path: "/v1/widgets",
      commandName: "CreateWidgetCommand",
      input: () => ({}),
    },
  ];

  function match(method: string, path: string) {
    const request = new Request(`http://localhost:1234${path}`, { method });

    return resolveSimRestJsonRoute(
      routes,
      readSimRestJsonRequest(request, new Uint8Array()),
    );
  }

  it("names the operation the method and the path state", () => {
    assertIdentical(
      match("GET", "/v1/widgets/w-1")?.route.commandName,
      "GetWidgetCommand",
    );
    assertIdentical(
      match("POST", "/v1/widgets")?.route.commandName,
      "CreateWidgetCommand",
    );
    assertIdentical(
      match("POST", "/v1/widgets/w-1/parts")?.route.commandName,
      "AddPartCommand",
    );
  });

  it("reads the labels a path stated out of it", () => {
    assertIdentical(
      match("GET", "/v1/widgets/w-1")?.labels.get("WidgetId"),
      "w-1",
    );
  });

  it("has no operation for a method the path is not served on", () => {
    assertUndefined(match("DELETE", "/v1/widgets/w-1"));
  });

  it("has no operation for a path whose literal segments differ", () => {
    // Given a path this table has nothing at, whose shape matches one it does
    // Then it resolves to nothing rather than to the operation it resembles
    assertUndefined(match("POST", "/v1/widgets/w-1/labels"));
    assertUndefined(match("GET", "/v2/widgets/w-1"));
  });

  it("has no operation for a path with segments left over", () => {
    // Given a longer path starting with one that is served
    // Then a label stands for one segment rather than for the rest of the
    // path, so the longer path is nobody's
    assertUndefined(match("GET", "/v1/widgets/w-1/parts/p-1"));
    assertUndefined(match("GET", "/v1/widgets"));
  });
});
