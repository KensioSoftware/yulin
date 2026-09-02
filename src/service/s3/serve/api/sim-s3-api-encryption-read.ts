import {
  parseXmlDocument,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlText,
} from "../../../../util/xml/xml-document.js";

/**
 * Read a default encryption configuration.
 *
 * Real S3 takes one rule and the SDK sends a list, so the list is read here
 * and the Bucket decides what to do with more than one of them.
 */
export function readSimS3EncryptionConfiguration(body: string): object {
  const root = parseXmlDocument(body);

  return {
    Rules: xmlChildren(root, "Rule").map((rule) => {
      const byDefault = xmlChild(rule, "ApplyServerSideEncryptionByDefault");

      return {
        ...(byDefault !== undefined && {
          ApplyServerSideEncryptionByDefault: {
            ...defined("SSEAlgorithm", xmlText(byDefault, "SSEAlgorithm")),
            ...defined("KMSMasterKeyID", xmlText(byDefault, "KMSMasterKeyID")),
          },
        }),
        ...defined("BucketKeyEnabled", xmlBoolean(rule, "BucketKeyEnabled")),
      };
    }),
  };
}

/**
 * One member of a request document, or nothing where it was absent.
 */
function defined<Value>(
  name: string,
  value: Value | undefined,
): Record<string, Value> {
  return value === undefined ? {} : { [name]: value };
}
