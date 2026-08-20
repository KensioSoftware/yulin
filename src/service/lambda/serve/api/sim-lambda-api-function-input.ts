import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimRestJsonInput } from "../../../../serve/http/api/rest-json/sim-rest-json-input.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";

/**
 * The invocation types real Lambda accepts, which it names in a header rather
 * than in the body.
 */
const invocationTypes: readonly string[] = [
  "RequestResponse",
  "Event",
  "DryRun",
];

/**
 * Read a CreateFunction request, whose members are all in the body.
 *
 * The one member JSON cannot carry as it is is the code, which travels base64
 * encoded and reaches the simulation as the bytes of a zip.
 */
export function createFunctionInput(
  input: SimRestJsonInput,
): Record<string, unknown> {
  const members = input.json();
  const code = members["Code"];

  return isRecord(code)
    ? { ...members, Code: functionCode(code) }
    : { ...members };
}

/**
 * Read an UpdateFunctionCode request, which names the function in the path and
 * carries the code members in the body rather than under a `Code` member.
 */
export function updateFunctionCodeInput(
  input: SimRestJsonInput,
): Record<string, unknown> {
  return {
    ...functionCode(input.json()),
    FunctionName: input.label("FunctionName"),
  };
}

function functionCode(code: Record<string, unknown>): Record<string, unknown> {
  const zipFile = code["ZipFile"];

  return typeof zipFile === "string"
    ? { ...code, ZipFile: Buffer.from(zipFile, "base64") }
    : code;
}

/**
 * Read an Invoke request, which states its members in three different places.
 *
 * The body is the payload itself rather than a JSON object holding it, so it
 * is passed on as the bytes that arrived. That is what lets `aws lambda
 * invoke --payload` send a document the handler receives unchanged.
 */
export function invokeInput(input: SimRestJsonInput): Record<string, unknown> {
  return {
    FunctionName: input.label("FunctionName"),
    InvocationType: invocationType(input.header("x-amz-invocation-type")),
    Qualifier: input.query("Qualifier"),
    Payload: input.body,
  };
}

/**
 * Check the invocation type a request asked for.
 *
 * An unrecognised one is refused the way real Lambda refuses it, rather than
 * passed on to a dispatcher that has nothing to do with it.
 */
function invocationType(value: string | undefined): string | undefined {
  if (value !== undefined && !invocationTypes.includes(value)) {
    throw new SimLambdaInvalidParameterValueException(
      `Unrecognized invocation type ${value}. Valid invocation types are ` +
        `${invocationTypes.join(", ")}.`,
    );
  }

  return value;
}
