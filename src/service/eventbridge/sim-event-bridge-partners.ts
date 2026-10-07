import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type {
  SimPutPartnerEventsCommand,
  SimPutPartnerEventsCommandOutput,
} from "./command/source/source.command.js";
import { SimEventBridgeInspection } from "./sim-event-bridge-inspection.js";
import { SimPartnerEventSource } from "./source/sim-partner-event-source.js";
import { SimPartnerEventSourceName } from "./source/sim-partner-event-source-name.js";
import type { SimPartnerEventSourceStore } from "./source/sim-partner-event-source-store.js";

/**
 * What a test does as a SaaS partner sending events to a simulated Account.
 *
 * A partner such as Stripe works from its own Account, which is outside the
 * simulation. It creates a partner event source shared with the receiving
 * Account, and puts events onto it. Both are simulator accessors here rather
 * than SDK commands, because the receiving Account's own clients never send
 * either request.
 */
export abstract class SimEventBridgePartners extends SimEventBridgeInspection {
  protected abstract readonly partnerSources: SimPartnerEventSourceStore;
  protected abstract readonly background: BackgroundScheduler;
  protected abstract readonly accountRegionScope: SimAwsAccountRegionScope;

  /**
   * Share a partner event source with this Account and Region, as the
   * partner's CreatePartnerEventSource does.
   *
   * The source starts pending. Creating a bus with the same `Name` and
   * `EventSourceName` activates it, and that bus then receives what
   * `putPartnerEvents` sends.
   */
  addPartnerEventSource(name: string): SimPartnerEventSource {
    const source = new SimPartnerEventSource({
      name: SimPartnerEventSourceName.of(name, "Name"),
      accountRegionScope: this.accountRegionScope,
      createdAt: this.background.now(),
    });

    this.partnerSources.add(source);

    return source;
  }

  /**
   * Put events onto partner event buses as their partner would, taking the
   * shape of the partner's PutPartnerEvents request.
   *
   * Each entry's `Source` has to name a source `addPartnerEventSource` shared
   * with this scope. The event goes to the bus of the same name, or nowhere if
   * that bus has not been created yet.
   */
  async putPartnerEvents(
    command: SimPutPartnerEventsCommand,
  ): Promise<SimPutPartnerEventsCommandOutput> {
    await this.background.sequence();
    return this.commands.putPartnerEvents.handle(command);
  }
}
