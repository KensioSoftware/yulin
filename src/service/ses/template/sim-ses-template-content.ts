import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../error/sim-ses.error.js";

/**
 * What a template says, with its placeholders still in it.
 *
 * All three parts are optional on real SES, and a template needs at least one
 * of them to be worth sending.
 */
export interface SimSesTemplateContent {
  readonly subject: string | undefined;
  readonly text: string | undefined;
  readonly html: string | undefined;
}

/**
 * Every `{{ }}` expression in a template, triple stache included.
 *
 * The first group is `{` when the expression was written `{{{ like this }}}`,
 * which is how Handlebars asks for a value to go in unescaped.
 */
export const simSesTemplateExpression = /\{\{(\{?)([^{}]*)\}?\}\}/g;

/**
 * What one segment of a substitution path may be made of.
 */
const pathSegment = /^[A-Za-z0-9_]+$/;

const braces = /[{}]/g;

/**
 * Read the content a template is being given, refusing what real SES refuses
 * and what this simulator does not render.
 */
export function readSimSesTemplateContent(content: {
  readonly Subject?: string | undefined;
  readonly Text?: string | undefined;
  readonly Html?: string | undefined;
}): SimSesTemplateContent {
  const { Subject: subject, Text: text, Html: html } = content;

  if (subject === undefined && text === undefined && html === undefined) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'templateContent' failed to " +
        "satisfy constraint: Member must specify Subject, Text or Html",
    );
  }

  for (const part of [subject, text, html]) {
    refuseUnrenderableExpressions(part);
  }

  return { subject, text, html };
}

/**
 * Refuse the Handlebars this simulator does not render.
 *
 * Real SES renders templates with Handlebars, which has block helpers,
 * partials and comments as well as plain substitution. Only substitution is
 * rendered here, and the rest is refused where the template is written rather
 * than left in place: a `{{#if premium}}` silently surviving into the sent
 * message would make a test pass on a message no real SES would produce.
 */
function refuseUnrenderableExpressions(part: string | undefined): void {
  if (part === undefined) {
    return;
  }

  for (const match of part.matchAll(simSesTemplateExpression)) {
    // The braces around the expression, stripped back off. Read from the whole
    // match rather than the capture group, which is always there but not
    // typed that way.
    const expression = match[0].replaceAll(braces, "").trim();

    if (!isSubstitutionPath(expression)) {
      throw new SimSesUnsupportedOperationException(
        `Only Handlebars substitution is simulated, so this template is ` +
          `refused rather than rendered wrongly: {{${expression}}} is a ` +
          `block helper, partial or comment`,
      );
    }
  }
}

/**
 * Whether an expression is a plain substitution: a name, or a dotted path into
 * the template data.
 *
 * Checked segment by segment rather than with one pattern over the whole path,
 * for the same reason a domain is: a pattern for a repeated group of repeated
 * characters backtracks badly on a long near miss.
 */
function isSubstitutionPath(expression: string): boolean {
  const segments = expression.split(".");

  return (
    segments.length > 0 &&
    segments.every((segment) => pathSegment.test(segment))
  );
}
