import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simEventsCommands from "./command/events/events.command.js";
import type { SimPersonalizePutEventsHandler } from "./command/events/sim-personalize-put-events.js";
import type { SimPersonalizePutItemsHandler } from "./command/events/sim-personalize-put-items.js";
import type { SimPersonalizePutUsersHandler } from "./command/events/sim-personalize-put-users.js";
import type { SimPersonalizeRequestOptions } from "./command/sim-personalize-request-options.js";
import { SimPersonalizeEventsSdkCommandRouter } from "./sdk/sim-personalize-events-sdk-command-router.js";

export interface SimPersonalizeEventsProperties {
  readonly putEvents: SimPersonalizePutEventsHandler;
  readonly putItems: SimPersonalizePutItemsHandler;
  readonly putUsers: SimPersonalizePutUsersHandler;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated Amazon Personalize Events. Handles SDK commands from the separate
 * Personalize Events client.
 *
 * It is never built alone. The event trackers it accepts interactions for and
 * the datasets it accepts items and users for belong to one simulated
 * Personalize, and so does the record of everything it has been sent. It is a
 * second API over that service's state, in the way simulated DynamoDB Streams
 * is over simulated DynamoDB.
 *
 * What arrives here changes no recommendation. Real Personalize feeds the
 * interactions into the dataset a later training run reads, and simulated
 * Personalize trains nothing. A campaign answers with what a test declared it
 * would answer with however many events it has been sent. The record is the
 * observable behaviour, and it is read back through
 * `personalize().recordedEvents()`.
 */
export class SimPersonalizeEvents {
  readonly #putEvents: SimPersonalizePutEventsHandler;
  readonly #putItems: SimPersonalizePutItemsHandler;
  readonly #putUsers: SimPersonalizePutUsersHandler;
  readonly #background: BackgroundScheduler;
  readonly #sdkRouter = new SimPersonalizeEventsSdkCommandRouter(this);

  constructor(properties: SimPersonalizeEventsProperties) {
    this.#putEvents = properties.putEvents;
    this.#putItems = properties.putItems;
    this.#putUsers = properties.putUsers;
    this.#background = properties.background;
  }

  /** Handle a PutEvents Command from the SDK. */
  async putEvents(
    command: simEventsCommands.SimPutEventsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simEventsCommands.SimPutEventsCommandOutput> {
    await this.#background.sequence();
    return this.#putEvents.handle(command, options);
  }

  /** Handle a PutItems Command from the SDK. */
  async putItems(
    command: simEventsCommands.SimPutItemsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simEventsCommands.SimPutItemsCommandOutput> {
    await this.#background.sequence();
    return this.#putItems.handle(command, options);
  }

  /** Handle a PutUsers Command from the SDK. */
  async putUsers(
    command: simEventsCommands.SimPutUsersCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simEventsCommands.SimPutUsersCommandOutput> {
    await this.#background.sequence();
    return this.#putUsers.handle(command, options);
  }

  /** The SDK Command router for this simulated Personalize Events. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}
