import { simSdkWireErrorStatusCode } from "../../../../sdk/wire/sim-sdk-wire-response.js";
import { simSdkWireJsonBody } from "../../../../sdk/wire/sim-sdk-wire-json.js";
import type { SimRestJsonOutput } from "./sim-rest-json-route.type.js";

const jsonContentType = { "content-type": "application/json" };

/**
 * Writes the responses of a REST-JSON service.
 *
 * A REST-JSON response is the operation's output as a JSON object, at the
 * status the operation answers with. There is no envelope around it and no
 * operation name in it, which is the whole of what separates this from the
 * Query and REST-XML protocols on the way back.
 */
export class SimRestJsonProtocol {
  /**
   * Answer an operation with the members it produced.
   *
   * `$metadata` is dropped, since it is the SDK's record of the response
   * rather than a member of it, and the SDK builds its own from what it
   * receives. A status with no content answers with no body, as HTTP requires.
   */
  response(output: SimRestJsonOutput, status: number): Response {
    if (status === 204) {
      return new Response(null, { status });
    }

    const { $metadata: _metadata, ...members } = output;

    return new Response(simSdkWireJsonBody(members), {
      status,
      headers: jsonContentType,
    });
  }

  /**
   * Refuse a request by name, in the shape an SDK reads an error out of.
   *
   * The name goes in the header the REST-JSON protocol reserves for it and in
   * the body, because a client reads whichever it finds first.
   */
  error(status: number, code: string, message: string): Response {
    return new Response(simSdkWireJsonBody({ __type: code, message }), {
      status,
      headers: { ...jsonContentType, "x-amzn-errortype": code },
    });
  }

  /**
   * Report what a simulated operation threw.
   *
   * A simulated service error already carries the AWS exception name and the
   * status real AWS answers with, so an SDK raises it under the name a handler
   * catching it in production would see.
   */
  failure(error: unknown): Response {
    const code = error instanceof Error ? error.name : "InternalFailure";
    const message = error instanceof Error ? error.message : String(error);

    return this.error(simSdkWireErrorStatusCode(error), code, message);
  }
}
