import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import { SimHttpApiOpenApiPointer } from "./sim-http-api-openapi-pointer.js";
import { simHttpApiOpenApiRefusal } from "./sim-http-api-openapi-refusal.js";
import { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * Read a serialised OpenAPI document into the object at its root.
 *
 * This is how both entry points carry the document: `ImportApi` takes it as a
 * string, and CloudFormation serialises the inline JSON object an
 * `AWS::ApiGatewayV2::Api` `Body` holds, so one reader sees both.
 */
export function simHttpApiOpenApiRoot(body: string): SimHttpApiOpenApiObject {
  const pointer = SimHttpApiOpenApiPointer.root();

  return new SimHttpApiOpenApiValue({
    pointer,
    value: parsed(body, pointer),
  }).object();
}

/**
 * Parse the body, refusing text that is not JSON at all.
 */
function parsed(body: string, pointer: SimHttpApiOpenApiPointer): JSONValue {
  try {
    return JSON.parse(body) as JSONValue;
  } catch {
    throw simHttpApiOpenApiRefusal(
      pointer,
      "is not a JSON document, and YAML is not parsed",
    );
  }
}
