import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimPersonalizeRecordedEvent } from "./event/sim-personalize-recorded-event.js";
import type { SimPersonalizeRecordedItem } from "./event/sim-personalize-recorded-item.js";
import type { SimPersonalizeRecordedUser } from "./event/sim-personalize-recorded-user.js";
import type { SimPersonalizeRankings } from "./recommendation/sim-personalize-rankings.js";
import type { SimPersonalizeRecommendations } from "./recommendation/sim-personalize-recommendations.js";
import type { SimPersonalizeCampaign } from "./resource/sim-personalize-campaign.js";
import type { SimPersonalizeDatasetGroup } from "./resource/sim-personalize-dataset-group.js";
import type { SimPersonalizeSolution } from "./resource/sim-personalize-solution.js";
import { SimPersonalizeSdkCommandRouter } from "./sdk/sim-personalize-sdk-command-router.js";
import { SimPersonalizeControlPlane } from "./sim-personalize-control-plane.js";
import { SimPersonalizeEvents } from "./sim-personalize-events.js";
import { SimPersonalizeRuntime } from "./sim-personalize-runtime.js";

/**
 * Simulated Amazon Personalize. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Nothing here trains a model or reads any data. The resources exist, they
 * carry what the request gave them, and they reach `ACTIVE` immediately, in
 * the way simulated ACM issues certificates without producing real TLS
 * certificates. What a campaign then recommends is declared against it rather
 * than learned.
 *
 * The control plane operations it inherits are the ones that build the chain
 * to a campaign. The runtime operations a campaign answers are on `runtime()`,
 * as they are on a client of their own in the SDK, and what they answer with
 * is declared through `recommendations()` and `rankings()`.
 *
 * The events API is on `events()`, on a client of its own again. What it is
 * sent is read back through `recordedEvents()`, `recordedItems()` and
 * `recordedUsers()`.
 */
export class SimPersonalize extends SimPersonalizeControlPlane {
  private readonly sdkRouter = new SimPersonalizeSdkCommandRouter(this);
  private readonly runtimeApi = new SimPersonalizeRuntime({
    recommendations: this.commands.recommendations,
    rankings: this.commands.rankings,
    background: this.background,
  });

  private readonly eventsApi = new SimPersonalizeEvents({
    putEvents: this.commands.putEvents,
    putItems: this.commands.putItems,
    putUsers: this.commands.putUsers,
    background: this.background,
  });

  /**
   * The Personalize Runtime API over this simulated Personalize.
   *
   * It is a second API over one service's state rather than a service of its
   * own, which is what AWS has too. A runtime call names a campaign this
   * Account and Region holds, and is answered from what is declared against
   * that campaign here.
   */
  runtime(): SimPersonalizeRuntime {
    return this.runtimeApi;
  }

  /**
   * The Personalize Events API over this simulated Personalize.
   *
   * A third API over one service's state. `PutEvents` names a tracking
   * ID this Account and Region holds an event tracker for, and what it records
   * is read back here.
   */
  events(): SimPersonalizeEvents {
    return this.eventsApi;
  }

  /**
   * Every item interaction the events API has accepted, oldest first.
   *
   * This is the simulator's own accessor rather than a Personalize operation.
   * Real Personalize puts the interactions into a dataset a later training run
   * reads, and offers no way to read them back.
   */
  recordedEvents(): readonly SimPersonalizeRecordedEvent[] {
    return this.commands.records.events;
  }

  /** Every item PutItems has added, oldest first. */
  recordedItems(): readonly SimPersonalizeRecordedItem[] {
    return this.commands.records.items;
  }

  /** Every user PutUsers has added, oldest first. */
  recordedUsers(): readonly SimPersonalizeRecordedUser[] {
    return this.commands.records.users;
  }

  /**
   * The recommendations one campaign answers GetRecommendations with.
   *
   * Declaring against a campaign ARN this scope does not hold raises, rather
   * than leaving the declaration somewhere no request will reach it.
   */
  recommendations(campaignArn: string): SimPersonalizeRecommendations {
    return this.commands.rules.recommendations(campaignArn);
  }

  /**
   * The rankings one campaign answers GetPersonalizedRanking with.
   */
  rankings(campaignArn: string): SimPersonalizeRankings {
    return this.commands.rules.rankings(campaignArn);
  }

  /**
   * Find a dataset group by name.
   *
   * This and the accessors below are the simulator's own, for tests inspecting
   * state without going through a Command and its authorization.
   */
  findDatasetGroup(name: string): SimPersonalizeDatasetGroup | undefined {
    return this.resources.datasetGroups.findByName(name);
  }

  /** Find a solution by name. */
  findSolution(name: string): SimPersonalizeSolution | undefined {
    return this.resources.solutions.findByName(name);
  }

  /** Find a campaign by name. */
  findCampaign(name: string): SimPersonalizeCampaign | undefined {
    return this.resources.campaigns.findByName(name);
  }

  /** The SDK Command router for this simulated Personalize. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
