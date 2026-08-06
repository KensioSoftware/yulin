import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { simCognitoCodeParameter } from "./sim-cognito-message-placeholders.js";

/**
 * How long each kind of verification message may be.
 *
 * These are the lengths real Cognito states for the wording inputs: an email
 * runs to 20,000 characters and a text message to the 140 an SMS carries.
 */
export const simCognitoLongestEmailMessage = 20_000;
export const simCognitoLongestSmsMessage = 140;

const shortestMessage = 6;

/**
 * Refuse verification wording real Cognito would refuse.
 *
 * Both rules are ones the API applies, so a pool accepted here that a
 * deployment turns down is the divergence worth refusing. The placeholder is
 * the one that matters most: the wording is what a recorded message says, and
 * wording without it is a message that would reach a user with no code in it.
 */
export function requireSimCognitoVerificationWording(
  option: string,
  message: string,
  longest: number,
): string {
  if (message.length < shortestMessage || message.length > longest) {
    throw new SimCognitoInvalidParameterException(
      `${option} is ${String(message.length)} characters, and Cognito takes ` +
        `${String(shortestMessage)} to ${String(longest)}`,
    );
  }

  if (!message.includes(simCognitoCodeParameter)) {
    throw new SimCognitoInvalidParameterException(
      `${option} does not carry the ${simCognitoCodeParameter} placeholder, ` +
        `so the user would be sent a message with no code in it`,
    );
  }

  return message;
}
