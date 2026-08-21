import type { SimSesLoggedEmail } from "../../service/aws/message/sim-aws-logged-message.js";
import type { SimSesSentEmailDestination } from "../../service/ses/email/sim-ses-sent-email.js";
import { bodyIndent, indented } from "./sim-message-indent.js";

/**
 * How much of an email's text body is printed before it is cut off.
 *
 * A message written for a person to read fits well inside this. The limit is
 * there for the ones written for a machine, where a signed link or an encoded
 * payload runs on until it has pushed everything else off the screen.
 */
export const defaultEmailTextLimit = 2000;

/**
 * How far the body parts are indented, one step under the labels above them.
 */
const partIndent = `${bodyIndent}${bodyIndent}`;

const bytesInAKilobyte = 1000;

interface SimEmailLogBlockProperties {
  readonly emailTextLimit?: number | undefined;
}

/**
 * The console block for one email a simulated SES accepted.
 *
 * Printing the whole message is the obvious answer and the wrong one. An HTML
 * part runs to kilobytes of markup and buries the sender, the recipients and
 * the subject, which are what says which send this was. So the summary comes
 * first, the text part follows it in full, and the HTML part is reported by
 * its size.
 */
export class SimEmailLogBlock {
  readonly #textLimit: number;

  constructor(properties: SimEmailLogBlockProperties = {}) {
    this.#textLimit = properties.emailTextLimit ?? defaultEmailTextLimit;
  }

  /**
   * The lines this email prints as.
   */
  lines(email: SimSesLoggedEmail): readonly string[] {
    return [
      `sim SES: ${email.fromEmailAddress} ${addressed(email.destination)}`,
      `${bodyIndent}Subject: ${email.subject}`,
      ...template(email),
      ...this.text(email),
      ...html(email),
    ];
  }

  /**
   * The text part, cut off at the limit with the cut marked.
   */
  private text(email: SimSesLoggedEmail): readonly string[] {
    if (email.text === undefined) {
      return [];
    }

    const overrun = email.text.length - this.#textLimit;
    const printed =
      overrun > 0 ? email.text.slice(0, this.#textLimit) : email.text;
    const cut =
      overrun > 0
        ? [`${partIndent}... ${overrun} more characters, not printed`]
        : [];

    return [
      `${bodyIndent}Text body:`,
      ...indented(printed, partIndent),
      ...cut,
    ];
  }
}

/**
 * Who the message went to, across the three lists, with each list named.
 *
 * A bcc that arrived as a bcc is part of what a reader is checking, and the
 * three lists read the same way once they are run together.
 */
function addressed(destination: SimSesSentEmailDestination): string {
  const lists: readonly [string, readonly string[]][] = [
    ["to", destination.toAddresses],
    ["cc", destination.ccAddresses],
    ["bcc", destination.bccAddresses],
  ];

  return lists
    .filter(([, addresses]) => addresses.length > 0)
    .map(([label, addresses]) => `${label} ${addresses.join(", ")}`)
    .join(", ");
}

/**
 * The template the message was rendered from, where a stored one was.
 *
 * The data goes with the name because it is what tells two sends of the same
 * template apart, and it is usually the thing being checked.
 */
function template(email: SimSesLoggedEmail): readonly string[] {
  if (email.templateName === undefined) {
    return [];
  }

  const data =
    email.templateData === undefined
      ? ""
      : ` ${JSON.stringify(email.templateData)}`;

  return [`${bodyIndent}Template: ${email.templateName}${data}`];
}

/**
 * The HTML part, measured and left unprinted.
 */
function html(email: SimSesLoggedEmail): readonly string[] {
  if (email.html === undefined) {
    return [];
  }

  return [`${bodyIndent}HTML body: ${sized(email.html)}, not printed`];
}

/**
 * How big a body is, in the units a reader thinks in.
 */
function sized(body: string): string {
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes < bytesInAKilobyte) {
    return `${bytes} bytes`;
  }

  return `${(bytes / bytesInAKilobyte).toFixed(1)} kB`;
}
