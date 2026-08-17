/**
 * Who a recorded message was addressed to, kept apart the way the request
 * carried it: a test asserting a bcc was a bcc needs the three lists to stay
 * three lists.
 */
export interface SimSesSentEmailDestination {
  readonly toAddresses: readonly string[];
  readonly ccAddresses: readonly string[];
  readonly bccAddresses: readonly string[];
}

/**
 * What a recorded message says.
 *
 * Both parts are optional because SES accepts a message with only one of them,
 * and a test asserting on the text of an HTML-only message should find nothing
 * rather than find the markup.
 */
export interface SimSesSentEmailBody {
  readonly text: string | undefined;
  readonly html: string | undefined;
}

interface SimSesSentEmailProperties {
  readonly messageId: string;
  readonly fromEmailAddress: string;
  readonly destination: SimSesSentEmailDestination;
  readonly replyToAddresses: readonly string[];
  readonly subject: string;
  readonly body: SimSesSentEmailBody;
  readonly templateName: string | undefined;
  readonly templateData: Readonly<Record<string, unknown>> | undefined;
  readonly configurationSetName: string | undefined;
  readonly sentDate: Date;
}

/**
 * One message a simulated SES would have sent.
 *
 * Nothing is delivered. SES keeps what it would have sent instead, which is
 * what lets a test assert that signing someone up produced a welcome message
 * addressed to them, without a mailbox to read or a network to reach.
 *
 * There is no simulated delivery to add later either. Where a message goes
 * after SES accepts it is a mail system rather than an AWS service, so the
 * recorded send is the whole of the observable behaviour, not a stand-in for
 * something not built yet.
 */
export class SimSesSentEmail {
  /** What SendEmail answered with, and the only handle SES gives a message. */
  public readonly messageId: string;

  /** The From value as the request gave it, display name and all. */
  public readonly fromEmailAddress: string;

  public readonly destination: SimSesSentEmailDestination;

  public readonly replyToAddresses: readonly string[];

  public readonly subject: string;

  public readonly body: SimSesSentEmailBody;

  /**
   * The template this message was rendered from, if it was rendered from a
   * stored one. A message written out in full has none, and so does one
   * rendered from a template the send wrote inline.
   */
  public readonly templateName: string | undefined;

  /**
   * What the template's placeholders were filled from, parsed out of the JSON
   * the send carried.
   *
   * This is usually the better thing for a test to assert on than the rendered
   * body: it survives someone rewording the email.
   */
  public readonly templateData: Readonly<Record<string, unknown>> | undefined;

  public readonly configurationSetName: string | undefined;

  public readonly sentDate: Date;

  constructor(properties: SimSesSentEmailProperties) {
    this.messageId = properties.messageId;
    this.fromEmailAddress = properties.fromEmailAddress;
    this.destination = properties.destination;
    this.replyToAddresses = properties.replyToAddresses;
    this.subject = properties.subject;
    this.body = properties.body;
    this.templateName = properties.templateName;
    this.templateData = properties.templateData;
    this.configurationSetName = properties.configurationSetName;
    this.sentDate = properties.sentDate;
  }

  /**
   * Every address this message went to, across to, cc and bcc.
   */
  get recipients(): readonly string[] {
    return [
      ...this.destination.toAddresses,
      ...this.destination.ccAddresses,
      ...this.destination.bccAddresses,
    ];
  }
}
