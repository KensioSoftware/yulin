/**
 * The AWS::SES::EmailIdentity properties this simulation has nothing to act
 * on, and why.
 *
 * They are recorded as ignored rather than refused, because an identity
 * without any of them still does the one thing an identity does here: exist to
 * be verified, and let a send from it through. Refusing would take a whole
 * stack down over a property that changes nothing about what a test is
 * checking, and every one of these is something CDK writes readily.
 *
 * The SDK path is stricter, and deliberately so: `CreateEmailIdentity` refuses
 * `DkimSigningAttributes` outright, because a caller reaching for it directly
 * is asking for that behaviour and should be told it is not there. A template
 * is a whole document, and one property in it should not sink the deploy.
 */
export const unsimulatedIdentityPropertyReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "DkimAttributes",
      "DKIM is not simulated, so nothing signs a message and nothing checks a " +
        "signature on one",
    ],
    [
      "DkimSigningAttributes",
      "DKIM signing is not simulated, so no key here signs anything and no " +
        "selector is ever published",
    ],
    [
      "ConfigurationSetAttributes",
      "configuration sets are not simulated, so naming a default one changes " +
        "nothing about a send from this identity",
    ],
    [
      "MailFromAttributes",
      "a custom MAIL FROM domain only changes the envelope sender, which no " +
        "recorded send here carries",
    ],
    [
      "FeedbackAttributes",
      "bounce and complaint forwarding is not simulated, because nothing here " +
        "bounces or complains",
    ],
    [
      "Tags",
      "email identity tags are not simulated, so nothing reads them back and " +
        "nothing is billed or grouped by them",
    ],
  ]);
