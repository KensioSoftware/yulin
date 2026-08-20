import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import type {
  SimWafCustomHeaderInput,
  SimWafCustomResponseBodies,
  SimWafHeader,
  SimWafResponseBody,
} from "./sim-waf-custom-response.type.js";

const contentTypes = new Map<string, string>([
  ["TEXT_PLAIN", "text/plain"],
  ["TEXT_HTML", "text/html"],
  ["APPLICATION_JSON", "application/json"],
]);

/**
 * Read the headers a custom request handling asks to insert.
 *
 * WAF prefixes every one of them with `x-amzn-waf-` as it inserts them, so a
 * header a rule added cannot be mistaken for one the client sent.
 */
export function simWafInsertedHeaders(
  headers: readonly SimWafCustomHeaderInput[] | undefined,
): readonly SimWafHeader[] {
  return (headers ?? []).map((header) => ({
    name: `x-amzn-waf-${requiredHeaderName(header.Name)}`,
    value: header.Value ?? "",
  }));
}

/**
 * Read the headers a custom response carries.
 *
 * These keep the names they were configured with. The `x-amzn-waf-` prefix is
 * for request header insertion, where it tells a rule's header apart from the
 * client's. `content-type` is refused, because the custom response body
 * decides that and a header setting it again would contradict the body.
 */
export function simWafResponseHeaders(
  headers: readonly SimWafCustomHeaderInput[] | undefined,
): readonly SimWafHeader[] {
  return (headers ?? []).map((header) => ({
    name: refusedContentType(requiredHeaderName(header.Name)),
    value: header.Value ?? "",
  }));
}

function refusedContentType(name: string): string {
  if (name.toLowerCase() === "content-type") {
    throw new SimWafInvalidParameterException(
      "Error reason: A custom response takes its content type from its body, " +
        "field: CUSTOM_HTTP_HEADER, parameter: content-type",
    );
  }

  return name;
}

function requiredHeaderName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimWafInvalidParameterException(
      "Error reason: A custom header needs a Name, field: CUSTOM_HTTP_HEADER, " +
        "parameter: Name",
    );
  }

  return name;
}

/**
 * Find the body a block action asked for among the web ACL's own.
 *
 * A key naming no body is refused where the web ACL is written, because a
 * block action that fell back to the default body would answer with something
 * other than what the rule said.
 */
export function requiredSimWafResponseBody(
  key: string,
  bodies: SimWafCustomResponseBodies,
): SimWafResponseBody {
  const body = new Map(Object.entries(bodies)).get(key);
  const contentType = contentTypes.get(body?.ContentType ?? "");

  if (body === undefined || contentType === undefined) {
    throw new SimWafInvalidParameterException(
      `Error reason: The custom response body ${key} is not one of this web ` +
        `ACL's CustomResponseBodies with a content type WAF answers with, ` +
        `field: CUSTOM_RESPONSE_BODY, parameter: ${key}`,
    );
  }

  return { contentType, content: body.Content ?? "" };
}
