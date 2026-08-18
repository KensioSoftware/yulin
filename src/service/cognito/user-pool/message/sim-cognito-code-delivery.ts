import type { SimCognitoMessageDelivery } from "./sim-cognito-message-delivery.js";
import type { SimCognitoMessageMedium } from "./sim-cognito-sent-message.js";

/**
 * Where a pool sent a code, as the operation that sent it reports it back.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CodeDeliveryDetailsType.html
 */
export interface SimCognitoCodeDeliveryDetailsType {
  readonly Destination?: string | undefined;
  readonly DeliveryMedium?: string | undefined;
  readonly AttributeName?: string | undefined;
}

/**
 * How many characters of a phone number Cognito leaves showing.
 */
const shownDigits = 4;

/**
 * The attribute each medium is reached by, which is what a response names.
 */
const attributeNames: Readonly<Record<SimCognitoMessageMedium, string>> = {
  EMAIL: "email",
  SMS: "phone_number",
};

/**
 * The details a pool answers with for a message it has just sent.
 *
 * Real Cognito reports where a code went without reporting the address it went
 * to, so the destination is masked. That masking is what makes the response
 * safe to show a browser: an application prints it to say which address to go
 * and look at, and someone who guessed the username learns nothing from it.
 *
 * The masked shape here follows real Cognito's rather than being read back
 * from a live account, so assert that a destination came back and which
 * medium carried it rather than on the mask itself.
 */
export function simCognitoCodeDelivery(
  delivery: SimCognitoMessageDelivery,
): SimCognitoCodeDeliveryDetailsType {
  return {
    Destination: simCognitoMaskedDestination(
      delivery.recipient,
      delivery.medium,
    ),
    DeliveryMedium: delivery.medium,
    AttributeName: attributeNames[delivery.medium],
  };
}

/**
 * The details a pool answers a reset for a user it does not hold with.
 *
 * An app client with `PreventUserExistenceErrors` of `ENABLED` answers a
 * `ForgotPassword` naming an unknown user as though a code had gone out, which
 * is what stops the operation being used to find out who has an account. Real
 * Cognito makes up a destination for it, and so does this: there is no address
 * behind it, so the username the request supplied is what gets masked.
 */
export function simCognitoHiddenCodeDelivery(
  username: string,
): SimCognitoCodeDeliveryDetailsType {
  return {
    Destination: simCognitoMaskedDestination(username, "EMAIL"),
    DeliveryMedium: "EMAIL",
    AttributeName: attributeNames.EMAIL,
  };
}

/**
 * One address with all but its first character and its last dotted part
 * hidden, which is how Cognito writes an address it will not report.
 *
 * A phone number keeps its last four digits instead, because that is the part
 * a person recognises their own number by.
 */
export function simCognitoMaskedDestination(
  recipient: string,
  medium: SimCognitoMessageMedium,
): string {
  if (medium === "SMS") {
    return maskedNumber(recipient);
  }

  return maskedAddress(recipient);
}

function maskedNumber(number: string): string {
  const shown = number.slice(-shownDigits);

  return `${"*".repeat(Math.max(number.length - shownDigits, 0))}${shown}`;
}

function maskedAddress(address: string): string {
  const at = address.indexOf("@");

  if (at === -1) {
    return maskedPart(address);
  }

  const domain = address.slice(at + 1);
  const dot = domain.indexOf(".");
  const host = dot === -1 ? domain : domain.slice(0, dot);
  const tail = dot === -1 ? "" : domain.slice(dot);

  return `${maskedPart(address.slice(0, at))}@${maskedPart(host)}${tail}`;
}

function maskedPart(part: string): string {
  return `${part.slice(0, 1)}***`;
}
