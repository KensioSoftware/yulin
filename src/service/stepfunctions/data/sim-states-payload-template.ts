// oxlint-disable security/detect-object-injection -- keys come from the
// Payload Template being evaluated, into an object built here.
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesPathMatchFailure,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import { isSimStatesIntrinsic } from "./sim-states-intrinsic-argument.js";
import { evaluateSimStatesIntrinsic } from "./sim-states-intrinsic.js";
import { selectSimStatesPath } from "./sim-states-path-segment.js";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";

const resolvedKeySuffix = ".$";

/**
 * Build a value from a Payload Template.
 *
 * `Parameters` and `ResultSelector` are both Payload Templates. A field whose
 * name ends in `.$` takes its value from a Reference Path or an intrinsic
 * function, and the `.$` comes off the name. Every other field is copied as it
 * stands, with objects and arrays walked so a `.$` field nested inside one is
 * still resolved.
 */
export function evaluateSimStatesPayloadTemplate(
  template: JSONValue,
  document: JSONValue,
): JSONValue {
  if (Array.isArray(template)) {
    return template.map((element) =>
      evaluateSimStatesPayloadTemplate(element, document),
    );
  }

  if (!isRecord(template)) {
    return template;
  }

  const built: JSONObject = {};

  for (const [key, value] of Object.entries(template)) {
    const resolved = key.endsWith(resolvedKeySuffix);
    const field = resolved ? key.slice(0, -resolvedKeySuffix.length) : key;

    if (Object.hasOwn(built, field)) {
      throw new SimStatesUnsimulatedInput(
        `${key} and another field of this Payload Template both build ` +
          `${field}, so one of them would be lost.`,
      );
    }

    built[field] = resolved
      ? resolveField(key, value, document)
      : evaluateSimStatesPayloadTemplate(value, document);
  }

  return built;
}

/**
 * Resolve one `.$` field to the value it names.
 */
function resolveField(
  key: string,
  value: JSONValue,
  document: JSONValue,
): JSONValue {
  if (typeof value !== "string") {
    throw new SimStatesUnsimulatedInput(
      `${key} ends in .$, so its value has to be a Reference Path or an ` +
        "intrinsic function written as a string.",
    );
  }

  if (isSimStatesIntrinsic(value)) {
    return evaluateSimStatesIntrinsic(value, document);
  }

  const selected = selectSimStatesPath(
    document,
    parseSimStatesReferencePath(value),
  );

  if (selected === undefined) {
    throw new SimStatesPathMatchFailure(
      `${key} reads ${value}, which selects nothing in the value the state ` +
        "was given.",
    );
  }

  return selected;
}
