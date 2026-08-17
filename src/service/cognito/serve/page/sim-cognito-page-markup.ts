/**
 * The parameters a managed login page carries from one step to the next.
 *
 * They are the authorize request's own query string, held as hidden inputs so
 * that the sign-in at the end of a sign-up reaches the app client's callback
 * URL with the `state` the application started with.
 */
export type SimCognitoPageParameters = Readonly<Record<string, string>>;

const escapes = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

/**
 * The HTML the simulated managed login pages are built from.
 *
 * There is no styling and there is no script. The pages exist so that a
 * browser in a local development server can complete a sign-up and a sign-in,
 * and so that a test can post the same forms. Matching what real managed login
 * looks like would be work no test could tell apart from this.
 *
 * Every value that reaches the page goes through `escaped`. A `state` is
 * whatever the application put in it, and it is written back into a hidden
 * input, so it is the one piece of this that a page could otherwise be broken
 * with.
 */
export class SimCognitoPageMarkup {
  /**
   * One page, answered as HTML.
   */
  page(title: string, body: string): Response {
    const html =
      `<!doctype html>\n<html lang="en">\n<head>\n` +
      `<meta charset="utf-8">\n<title>${this.escaped(title)}</title>\n` +
      `</head>\n<body>\n<h1>${this.escaped(title)}</h1>\n${body}\n` +
      `</body>\n</html>\n`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  /**
   * Send the browser on to the next page of the flow.
   *
   * A form post is answered with a 303 so that the browser follows it with a
   * GET, which is what stops a reload posting the form a second time.
   */
  redirect(path: string, parameters: SimCognitoPageParameters): Response {
    const query = new URLSearchParams(parameters).toString();

    return new Response(undefined, {
      status: 303,
      headers: { location: `${path}?${query}`, "cache-control": "no-store" },
    });
  }

  /**
   * A form posting back to the path it was served from.
   */
  form(action: string, body: string): string {
    return `<form method="post" action="${this.escaped(action)}">\n${body}</form>\n`;
  }

  /**
   * One labelled input, with the label naming the field it is for.
   */
  field(name: string, label: string, type = "text"): string {
    const escapedName = this.escaped(name);

    return (
      `<p><label for="${escapedName}">${this.escaped(label)}</label>\n` +
      `<input id="${escapedName}" name="${escapedName}" ` +
      `type="${this.escaped(type)}" required></p>\n`
    );
  }

  /**
   * The parameters this page carries on to the next one.
   */
  hidden(parameters: SimCognitoPageParameters): string {
    return Object.entries(parameters)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${this.escaped(name)}" ` +
          `value="${this.escaped(value)}">\n`,
      )
      .join("");
  }

  /**
   * A link to another page of the flow, carrying the same parameters.
   */
  link(
    path: string,
    parameters: SimCognitoPageParameters,
    text: string,
  ): string {
    const query = new URLSearchParams(parameters).toString();

    return `<p><a href="${this.escaped(`${path}?${query}`)}">${this.escaped(text)}</a></p>\n`;
  }

  /**
   * What went wrong with the form that was just posted.
   */
  message(text: string): string {
    return `<p class="message">${this.escaped(text)}</p>\n`;
  }

  /**
   * A submit button, named so that a form with two of them says which was
   * pressed.
   */
  submit(name: string, label: string): string {
    return (
      `<p><button type="submit" name="${this.escaped(name)}" ` +
      `value="${this.escaped(name)}">${this.escaped(label)}</button></p>\n`
    );
  }

  /**
   * A value written into HTML, with the five characters that would otherwise
   * change what the page means replaced.
   */
  escaped(value: string): string {
    return value.replaceAll(/[&<>"']/gu, (character) => {
      return escapes.get(character) ?? character;
    });
  }
}
