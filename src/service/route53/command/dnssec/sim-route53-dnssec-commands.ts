import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimKmsKeyResolver } from "../../../kms/registry/sim-kms-registry.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";
import { SimRoute53DnssecScope } from "./sim-route53-dnssec-scope.js";
import { SimRoute53KskCommands } from "./sim-route53-ksk-commands.js";
import { SimRoute53KskKmsKey } from "./sim-route53-ksk-kms-key.js";
import { SimRoute53ZoneSigningCommands } from "./sim-route53-zone-signing-commands.js";

interface SimRoute53DnssecCommandsProperties {
  readonly hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly kmsKeys?: SimKmsKeyResolver | undefined;
}

/**
 * The DNSSEC commands of one simulated Route53 scope, and the state they
 * share.
 *
 * Grouped rather than wired one at a time on the service facade, because all
 * seven start from the same hosted zone lookup and authorization, and four of
 * them work on the same key-signing key list.
 */
export class SimRoute53DnssecCommands {
  public readonly keySigningKeys: SimRoute53KskCommands;
  public readonly zoneSigning: SimRoute53ZoneSigningCommands;

  constructor(properties: SimRoute53DnssecCommandsProperties) {
    const scope = new SimRoute53DnssecScope({
      hostedZones: properties.hostedZones,
      iam: properties.iam,
      background: properties.background,
    });

    this.keySigningKeys = new SimRoute53KskCommands({
      scope,
      kmsKey: new SimRoute53KskKmsKey({ kmsKeys: properties.kmsKeys }),
      clock: properties.background,
    });
    this.zoneSigning = new SimRoute53ZoneSigningCommands({ scope });
  }
}
