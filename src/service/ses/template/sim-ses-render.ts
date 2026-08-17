import { SimSesUnsupportedOperationException } from "../error/sim-ses.error.js";
import { simSesTemplateExpression } from "./sim-ses-template-content.js";

/**
 * What Handlebars replaces when it escapes a value.
 */
const htmlEscapes: ReadonlyMap<string, string> = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#x27;"],
  ["`", "&#x60;"],
  ["=", "&#x3D;"],
]);

/**
 * Render one part of a template against the data a send carried.
 *
 * A placeholder naming something the data does not have becomes an empty
 * string rather than a failure. That is what Handlebars does and so what real
 * SES does, and it is much the commonest surprise in an SES template: the
 * message goes out with a hole in it and nothing reports a problem. A test
 * asserting on the rendered body is how that gets caught.
 *
 * `{{ name }}` HTML-escapes its value and `{{{ name }}}` does not, again
 * following Handlebars, which is the template engine real SES renders with.
 * The escaping applies to the text part as well as the HTML one, because
 * Handlebars renders a string without knowing what it is for.
 */
export function renderSimSesTemplatePart(
  part: string,
  data: Readonly<Record<string, unknown>>,
): string {
  return part.replaceAll(
    simSesTemplateExpression,
    (_match: string, unescaped: string, expression: string) => {
      const value = readTemplateValue(data, expression.trim());

      return unescaped === "{" ? value : escapeHtml(value);
    },
  );
}

/**
 * Read a dotted path out of the template data.
 *
 * Own properties only, walked with a descriptor rather than an index, so
 * `{{constructor}}` reaches nothing rather than reaching up the prototype
 * chain.
 */
function readTemplateValue(
  data: Readonly<Record<string, unknown>>,
  expression: string,
): string {
  let value: unknown = data;

  for (const segment of expression.split(".")) {
    if (typeof value !== "object" || value === null) {
      return "";
    }

    value = Object.getOwnPropertyDescriptor(value, segment)?.value;
  }

  return substituted(value, expression);
}

/**
 * What a resolved value becomes in the rendered message.
 *
 * A value that is not a primitive is refused rather than guessed at. Real
 * Handlebars would put `[object Object]` in the message, which is a mistake
 * worth reporting rather than reproducing: nobody means to send it, and a test
 * whose data has an object where the template wants a name should find out
 * where the mistake is.
 */
function substituted(value: unknown, expression: string): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new SimSesUnsupportedOperationException(
    `Template data for {{${expression}}} is not a value that can go into a ` +
      `message. Substitution renders strings, numbers and booleans.`,
  );
}

/**
 * Escape a value the way Handlebars does.
 *
 * Built a character at a time rather than by replacing each escapable
 * character in turn across the whole string, so an ampersand introduced by one
 * replacement is not escaped again by the next.
 */
function escapeHtml(value: string): string {
  let escaped = "";

  for (const character of value) {
    escaped += htmlEscapes.get(character) ?? character;
  }

  return escaped;
}
