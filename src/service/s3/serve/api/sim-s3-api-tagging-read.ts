import {
  parseXmlDocument,
  xmlChild,
  xmlChildren,
  xmlText,
} from "../../../../util/xml/xml-document.js";

/**
 * Read the tag set a PutObjectTagging body carries.
 *
 * This sits apart from the other request-body readers because it is the only
 * one about an Object rather than about a Bucket's configuration. A tag naming
 * no key comes through with none, so the tagging command refuses it rather than
 * the reader silently dropping it.
 */
export function readSimS3Tagging(body: string): object {
  return {
    TagSet: xmlChildren(xmlChild(parseXmlDocument(body), "TagSet"), "Tag").map(
      (tag) => ({
        ...stated("Key", xmlText(tag, "Key")),
        ...stated("Value", xmlText(tag, "Value")),
      }),
    ),
  };
}

/**
 * Include a member only when the document stated it.
 */
function stated(
  name: string,
  value: string | undefined,
): Record<string, string> {
  return value === undefined ? {} : { [name]: value };
}
