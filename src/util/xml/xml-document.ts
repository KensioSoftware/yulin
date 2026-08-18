/**
 * One element of a parsed XML document.
 *
 * Attributes are dropped. The documents this reads are AWS request bodies,
 * where every value a service reads travels as element text, and the only
 * attribute any of them carries is the default namespace.
 */
export interface XmlElement {
  readonly name: string;
  /** The element's own text, with child element text left out. */
  readonly text: string;
  readonly children: readonly XmlElement[];
}

interface MutableXmlElement {
  readonly name: string;
  text: string;
  readonly children: MutableXmlElement[];
}

// The attributes run greedily to the closing angle bracket, with no
// alternation, so the pattern cannot backtrack. Whether the tag closed itself
// is read off the end of that run rather than matched separately.
const tagPattern =
  /<(?<closing>\/)?(?<name>[A-Za-z_][\w.:-]*)(?<attributes>[^>]*)>/g;

const prologPattern = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?]]>/g;

/**
 * Read an XML document as a tree of elements.
 *
 * This handles the shape AWS request bodies actually take, which is elements,
 * text and nothing else. Returns undefined for a document with no element in
 * it, which is what an empty body parses to.
 *
 * A closing tag that does not match the element it closes is ignored rather
 * than raising, because a service reading a malformed body answers with its own
 * error rather than a parser's.
 */
export function parseXmlDocument(source: string): XmlElement | undefined {
  const document = source.replaceAll(prologPattern, "");
  const stack: MutableXmlElement[] = [];
  let root: MutableXmlElement | undefined;
  let index = 0;

  for (const match of document.matchAll(tagPattern)) {
    const groups = match.groups ?? {};
    const open = stack.at(-1);

    if (open !== undefined) {
      open.text += decodeXmlText(document.slice(index, match.index));
    }
    index = match.index + match[0].length;

    if (groups["closing"] === "/") {
      stack.pop();
      continue;
    }

    const name = groups["name"] ?? "";
    const element: MutableXmlElement = { name, text: "", children: [] };
    open?.children.push(element);
    root ??= element;

    if (!(groups["attributes"] ?? "").trimEnd().endsWith("/")) {
      stack.push(element);
    }
  }

  return root;
}

/**
 * The first child element of the given name, if the element has one.
 */
export function xmlChild(
  element: XmlElement | undefined,
  name: string,
): XmlElement | undefined {
  return element?.children.find((child) => child.name === name);
}

/**
 * Every child element of the given name, in document order.
 */
export function xmlChildren(
  element: XmlElement | undefined,
  name: string,
): readonly XmlElement[] {
  return element?.children.filter((child) => child.name === name) ?? [];
}

/**
 * The trimmed text of a named child, if the element has one.
 */
export function xmlText(
  element: XmlElement | undefined,
  name: string,
): string | undefined {
  return xmlChild(element, name)?.text.trim();
}

/**
 * The boolean a named child states, if the element has one.
 */
export function xmlBoolean(
  element: XmlElement | undefined,
  name: string,
): boolean | undefined {
  const text = xmlText(element, name);

  return text === undefined ? undefined : text === "true";
}

/**
 * The number a named child states, if the element has one that is a number.
 */
export function xmlNumber(
  element: XmlElement | undefined,
  name: string,
): number | undefined {
  const text = xmlText(element, name);

  if (text === undefined) {
    return undefined;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : undefined;
}

const entities: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

/**
 * Decode the entities XML text carries.
 */
function decodeXmlText(text: string): string {
  return text.replaceAll(
    /&(#x?[\da-f]+|\w+);/gi,
    (whole, reference: string) => {
      if (reference.startsWith("#x") || reference.startsWith("#X")) {
        return codePoint(Number.parseInt(reference.slice(2), 16), whole);
      }
      if (reference.startsWith("#")) {
        return codePoint(Number(reference.slice(1)), whole);
      }

      return entities.get(reference.toLowerCase()) ?? whole;
    },
  );
}

/**
 * A numeric character reference, left as written when it names no character.
 */
function codePoint(value: number, whole: string): string {
  return Number.isFinite(value) && value >= 0 && value <= 0x10_ff_ff
    ? String.fromCodePoint(value)
    : whole;
}
