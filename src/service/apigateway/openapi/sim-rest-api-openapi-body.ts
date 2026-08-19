import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { simRestApiOpenApiRefusal } from "./sim-rest-api-openapi-refusal.js";
import { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * Read a serialised OpenAPI document into the object at its root.
 *
 * This is how all three entry points carry the document. `ImportRestApi` and
 * `PutRestApi` take it as the request body, and CloudFormation serialises the
 * inline JSON object an `AWS::ApiGateway::RestApi` `Body` holds, so one reader
 * sees every one of them.
 */
export function simRestApiOpenApiRoot(body: string): SimRestApiOpenApiObject {
  const pointer = SimRestApiOpenApiPointer.root();

  return new SimRestApiOpenApiValue({
    pointer,
    value: parsed(body, pointer),
  }).object();
}

/**
 * Parse the body, refusing text that is not JSON at all.
 */
function parsed(body: string, pointer: SimRestApiOpenApiPointer): JSONValue {
  try {
    return JSON.parse(body) as JSONValue;
  } catch {
    throw simRestApiOpenApiRefusal(
      pointer,
      "is not a JSON document, and YAML is not parsed",
    );
  }
}
