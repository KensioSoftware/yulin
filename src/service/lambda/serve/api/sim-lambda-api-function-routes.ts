import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimRestJsonInput } from "../../../../serve/http/api/rest-json/sim-rest-json-input.js";
import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { simLambdaInvokeResponse } from "./sim-lambda-api-invoke-output.js";

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
 * The function operations this endpoint serves.
 */
export const simLambdaFunctionApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2015-03-31/functions",
    commandName: "CreateFunctionCommand",
    status: 201,
    input: createFunctionInput,
  },
  {
    method: "GET",
    path: "/2015-03-31/functions/{FunctionName}",
    commandName: "GetFunctionCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "DELETE",
    path: "/2015-03-31/functions/{FunctionName}",
    commandName: "DeleteFunctionCommand",
    input: (input) => ({ FunctionName: input.label("FunctionName") }),
  },
  {
    method: "POST",
    path: "/2015-03-31/functions/{FunctionName}/invocations",
    commandName: "InvokeCommand",
    input: invokeInput,
    output: simLambdaInvokeResponse,
  },
];

/**
 * Read a CreateFunction request, whose members are all in the body.
 *
 * The one member JSON cannot carry as it is is the code, which travels base64
 * encoded and reaches the simulation as the bytes of a zip.
 */
function createFunctionInput(input: SimRestJsonInput): Record<string, unknown> {
  const members = input.json();
  const code = members["Code"];

  return isRecord(code)
    ? { ...members, Code: functionCode(code) }
    : { ...members };
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
function invokeInput(input: SimRestJsonInput): Record<string, unknown> {
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
