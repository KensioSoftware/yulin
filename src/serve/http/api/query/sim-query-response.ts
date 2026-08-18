import {
  escapeXmlText,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";
import { simSdkWireErrorStatusCode } from "../../../../sdk/wire/sim-sdk-wire-response.js";

/**
 * A request id, which every Query response carries and nothing reads back.
 */
const simQueryRequestId = "00000000-0000-0000-0000-000000000000";

/**
 * Writes the responses of one Query protocol service.
 *
 * Every Query response has the same shape: `<XResponse><XResult>...</XResult>`
 * and a `ResponseMetadata` holding the request id. An SDK reads the operation's
 * output out of the inner element, so the envelope carries the operation name
 * rather than a generic one.
 *
 * What differs between services is the XML namespace stamped on the envelope,
 * and each states its own. A client parses either way, since it reads the
 * elements by name, so this is fidelity rather than something a caller depends
 * on.
 */
export class SimQueryProtocol {
  private readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  /**
   * Answer an operation with the result members it produced.
   */
  response(action: string, result: string): Response {
    const metadata = xmlElement(
      "ResponseMetadata",
      xmlValue("RequestId", simQueryRequestId),
    );

    return this.xml(
      200,
      `${action}Response`,
      `${xmlElement(`${action}Result`, result)}${metadata}`,
    );
  }

  /**
   * Refuse a request by name, in the shape an SDK reads an error out of.
   */
  error(status: number, code: string, message: string): Response {
    const fault = status >= 500 ? "Receiver" : "Sender";
    const error = xmlElement(
      "Error",
      xmlValue("Type", fault) +
        xmlValue("Code", code) +
        xmlValue("Message", message),
    );

    return this.xml(
      status,
      "ErrorResponse",
      `${error}${xmlValue("RequestId", simQueryRequestId)}`,
    );
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

  private xml(status: number, rootName: string, content: string): Response {
    const body =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<${rootName} xmlns="${escapeXmlText(this.namespace)}">${content}</${rootName}>`;

    return new Response(body, {
      status,
      headers: { "content-type": "text/xml" },
    });
  }
}
