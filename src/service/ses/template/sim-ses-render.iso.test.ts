import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { renderSimSesTemplatePart } from "./sim-ses-render.js";

describe("renderSimSesTemplatePart", () => {
  it("substitutes a value where the placeholder is", () => {
    // Given a part with a placeholder in the middle of it.
    const part = "Hi {{name}}, welcome.";

    // When it is rendered.
    const rendered = renderSimSesTemplatePart(part, { name: "Ada" });

    assertIdentical(rendered, "Hi Ada, welcome.");
  });

  it("ignores whitespace inside the braces", () => {
    // Given a placeholder written with spaces, as Handlebars allows.
    const rendered = renderSimSesTemplatePart("Hi {{  name  }}", {
      name: "Ada",
    });

    assertIdentical(rendered, "Hi Ada");
  });

  it("substitutes the same placeholder everywhere it appears", () => {
    // Given a part naming one value twice.
    const rendered = renderSimSesTemplatePart("{{name}} and {{name}}", {
      name: "Ada",
    });

    assertIdentical(rendered, "Ada and Ada");
  });

  it("HTML-escapes a substituted value", () => {
    // Given data carrying markup.
    const rendered = renderSimSesTemplatePart("<p>{{name}}</p>", {
      name: "<b>Ada</b> & co",
    });

    // Then the value is escaped and the template's own markup is not. Real SES
    // renders with Handlebars, whose `{{ }}` escapes, so a value that looks
    // like markup arrives as text.
    assertIdentical(rendered, "<p>&lt;b&gt;Ada&lt;/b&gt; &amp; co</p>");
  });

  it("does not escape a triple stache", () => {
    // Given a placeholder written `{{{ }}}`, which is how Handlebars asks for
    // a value to go in as it stands.
    const rendered = renderSimSesTemplatePart("<p>{{{markup}}}</p>", {
      markup: "<b>Ada</b>",
    });

    assertIdentical(rendered, "<p><b>Ada</b></p>");
  });

  it("escapes the text part as well as the HTML one", () => {
    // Given a text part carrying an ampersand.
    const rendered = renderSimSesTemplatePart("Ada {{company}}", {
      company: "Lovelace & Co",
    });

    // Then it is escaped there too: Handlebars renders a string without
    // knowing what it is for, so this is a real divergence to watch for in a
    // plain text email.
    assertIdentical(rendered, "Ada Lovelace &amp; Co");
  });

  it("leaves a part with no placeholders alone", () => {
    const rendered = renderSimSesTemplatePart("Nothing to fill in.", {
      name: "Ada",
    });

    assertIdentical(rendered, "Nothing to fill in.");
  });
});
