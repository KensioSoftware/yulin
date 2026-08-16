/**
 * The Handlebars this simulator will not render, refused at the template.
 */

import { CreateEmailTemplateCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";
import { SimSesUnsupportedOperationException } from "@kensio/yulin/ses";

const ses = new SimAws().sesV2();

try {
  await ses.createEmailTemplate(
    new CreateEmailTemplateCommand({
      TemplateName: "welcome",
      TemplateContent: {
        Subject: "Welcome",
        Text: "{{#if premium}}Thanks for subscribing{{/if}}",
      },
    }),
  );
} catch (error) {
  // true: block helpers, partials and comments are not rendered here, and a
  // template carrying one is refused rather than sent with it still in place.
  console.log(error instanceof SimSesUnsupportedOperationException);
}
