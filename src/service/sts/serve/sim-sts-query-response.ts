import {
  escapeXmlText,
  xmlElement,
  xmlValue,
} from "../../../util/xml/xml-writer.js";

/**
 * The XML namespace real STS stamps on every response it sends.
 */
const stsNamespace = "https://sts.amazonaws.com/doc/2011-06-15/";

/**
 * Write a Query protocol response, which wraps a result in an envelope named
 * after the operation.
 *
 * Every Query response has this shape: `<XResponse><XResult>...</XResult>` and
 * a `ResponseMetadata` holding the request id. An SDK reads the operation's
 * output out of the inner element, so the envelope has to carry the operation
 * name rather than a generic one.
 */
export function simStsQueryResponse(action: string, result: string): Response {
  const metadata = xmlElement(
    "ResponseMetadata",
    xmlValue("RequestId", simStsRequestId()),
  );
  const envelope = `${xmlElement(`${action}Result`, result)}${metadata}`;
  const body = `<?xml version="1.0" encoding="UTF-8"?><${action}Response xmlns="${escapeXmlText(stsNamespace)}">${envelope}</${action}Response>`;

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

/**
 * Write a Query protocol failure, which an SDK reads the error name out of.
 */
export function simStsQueryErrorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  const error = xmlElement(
    "Error",
    `${xmlValue("Type", "Sender")}${xmlValue("Code", code)}${xmlValue("Message", message)}`,
  );
  const envelope = xmlElement(
    "ErrorResponse",
    `${error}${xmlValue("RequestId", simStsRequestId())}`,
  );
  const body = `<?xml version="1.0" encoding="UTF-8"?>${envelope}`;

  return new Response(body, {
    status,
    headers: { "content-type": "text/xml" },
  });
}

/**
 * A request id, which every Query response carries and nothing reads back.
 */
function simStsRequestId(): string {
  return "00000000-0000-0000-0000-000000000000";
}
