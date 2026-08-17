/**
 * The message attribute carrying the name an SMS appears to come from.
 */
export const simSnsSenderIdAttribute = "AWS.SNS.SMS.SenderID";

/**
 * The message attribute saying whether an SMS is transactional or promotional.
 */
export const simSnsSmsTypeAttribute = "AWS.SNS.SMS.SMSType";

/**
 * The reserved SMS attributes a publish may carry here.
 *
 * Message attribute names beginning with `AWS.` are reserved, and real SNS
 * refuses one a caller invents. These two are AWS's own, so real SNS takes
 * them and so does this. Both are recorded on the SMS and read back from it.
 */
export const simSnsSmsAttributeNames: ReadonlySet<string> = new Set([
  simSnsSenderIdAttribute,
  simSnsSmsTypeAttribute,
]);

/**
 * The reserved SMS attributes real SNS acts on and this simulation does not.
 *
 * Each is refused by name with the reason. An accepted `MaxPrice` that capped
 * no spending would be a price cap a test believed was applied. That is the
 * same reasoning that refuses `MessageGroupId` on a publish.
 */
export const simSnsUnsimulatedSmsAttributes: ReadonlyMap<string, string> =
  new Map([
    [
      "AWS.SNS.SMS.MaxPrice",
      "Per-message pricing is not simulated. Nothing here would hold a " +
        "message to a price cap.",
    ],
    [
      "AWS.MM.SMS.OriginationNumber",
      "Origination numbers and phone pools are not simulated.",
    ],
    [
      "AWS.SNS.SMS.EntityId",
      "The India DLT registration these identify is not simulated.",
    ],
    [
      "AWS.SNS.SMS.TemplateId",
      "The India DLT registration these identify is not simulated.",
    ],
  ]);
