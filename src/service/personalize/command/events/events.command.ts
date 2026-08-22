import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The metadata an event, an item or a user carries.
 *
 * Real Personalize takes a JSON string here. The SDK serialises an object into
 * one before the request leaves the client, so an intercepted Command can
 * arrive carrying either, and both are accepted.
 */
export type SimPersonalizeProperties =
  | string
  | Readonly<Record<string, unknown>>;

/**
 * One item interaction within a PutEvents request.
 */
export interface SimPersonalizeEventInput {
  readonly eventId?: string | undefined;
  readonly eventType?: string | undefined;
  readonly eventValue?: number | undefined;
  readonly itemId?: string | undefined;
  readonly properties?: SimPersonalizeProperties | undefined;
  readonly sentAt?: Date | undefined;
  readonly recommendationId?: string | undefined;
  readonly impression?: readonly string[] | undefined;
}

/**
 * Minimal structural sim Personalize Events PutEvents command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize-events/command/PutEventsCommand/
 */
export interface SimPutEventsCommand {
  readonly input: SimPutEventsCommandInput;
}

export interface SimPutEventsCommandInput {
  readonly trackingId?: string | undefined;
  readonly userId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly eventList?: readonly SimPersonalizeEventInput[] | undefined;
}

export interface SimPutEventsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * One item within a PutItems request.
 */
export interface SimPersonalizeItemInput {
  readonly itemId?: string | undefined;
  readonly properties?: SimPersonalizeProperties | undefined;
}

/**
 * Minimal structural sim Personalize Events PutItems command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize-events/command/PutItemsCommand/
 */
export interface SimPutItemsCommand {
  readonly input: SimPutItemsCommandInput;
}

export interface SimPutItemsCommandInput {
  readonly datasetArn?: string | undefined;
  readonly items?: readonly SimPersonalizeItemInput[] | undefined;
}

export interface SimPutItemsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * One user within a PutUsers request.
 */
export interface SimPersonalizeUserInput {
  readonly userId?: string | undefined;
  readonly properties?: SimPersonalizeProperties | undefined;
}

/**
 * Minimal structural sim Personalize Events PutUsers command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize-events/command/PutUsersCommand/
 */
export interface SimPutUsersCommand {
  readonly input: SimPutUsersCommandInput;
}

export interface SimPutUsersCommandInput {
  readonly datasetArn?: string | undefined;
  readonly users?: readonly SimPersonalizeUserInput[] | undefined;
}

export interface SimPutUsersCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
