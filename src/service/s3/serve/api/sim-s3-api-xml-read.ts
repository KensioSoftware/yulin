import {
  parseXmlDocument,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlText,
} from "../../../../util/xml/xml-document.js";

/**
 * Read the S3 request bodies that arrive as XML.
 *
 * Real S3 takes these configurations as XML documents, which is why the
 * operations that set them are the only ones here with a body to read. An
 * absent or unreadable member comes back undefined, and the operation itself
 * decides whether that is a refusal.
 */

/**
 * Read a DeleteObjects body, which names the Objects to remove.
 */
export function readSimS3DeleteRequest(body: string): object {
  const root = parseXmlDocument(body);
  const quiet = xmlBoolean(root, "Quiet");

  return {
    Objects: xmlChildren(root, "Object").map((object) => ({
      ...defined("Key", xmlText(object, "Key")),
    })),
    ...defined("Quiet", quiet),
  };
}

/**
 * Read a Block Public Access configuration.
 */
export function readSimS3PublicAccessBlock(body: string): object {
  const root = parseXmlDocument(body);

  return {
    ...defined("BlockPublicAcls", xmlBoolean(root, "BlockPublicAcls")),
    ...defined("IgnorePublicAcls", xmlBoolean(root, "IgnorePublicAcls")),
    ...defined("BlockPublicPolicy", xmlBoolean(root, "BlockPublicPolicy")),
    ...defined(
      "RestrictPublicBuckets",
      xmlBoolean(root, "RestrictPublicBuckets"),
    ),
  };
}

/**
 * Read a website configuration.
 */
export function readSimS3WebsiteConfiguration(body: string): object {
  const root = parseXmlDocument(body);
  const index = xmlChild(root, "IndexDocument");
  const error = xmlChild(root, "ErrorDocument");
  const redirect = xmlChild(root, "RedirectAllRequestsTo");

  return {
    ...defined(
      "IndexDocument",
      index === undefined
        ? undefined
        : { ...defined("Suffix", xmlText(index, "Suffix")) },
    ),
    ...defined(
      "ErrorDocument",
      error === undefined
        ? undefined
        : { ...defined("Key", xmlText(error, "Key")) },
    ),
    ...defined(
      "RedirectAllRequestsTo",
      redirect === undefined
        ? undefined
        : {
            ...defined("HostName", xmlText(redirect, "HostName")),
            ...defined("Protocol", xmlText(redirect, "Protocol")),
          },
    ),
  };
}

/**
 * Include a member only when the document stated it.
 */
function defined<T>(name: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [name]: value };
}
