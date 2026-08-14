import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  SimRoute53KeySigningKey,
  SimRoute53KeySigningKeyStatus,
} from "../../dnssec/sim-route53-key-signing-key.js";
import type { SimRoute53DnssecScope } from "./sim-route53-dnssec-scope.js";
import type { SimRoute53KskKmsKey } from "./sim-route53-ksk-kms-key.js";
import { SimRoute53KskInput } from "./sim-route53-ksk-input.js";
import type {
  SimCreateKeySigningKeyCommand,
  SimCreateKeySigningKeyCommandOutput,
  SimKeySigningKeyCommand,
  SimKeySigningKeyCommandOutput,
} from "./dnssec.command.js";
import type { SimRoute53RequestOptions } from "../../sim-route53-request-options.js";

interface SimRoute53KskCommandsProperties {
  readonly scope: SimRoute53DnssecScope;
  readonly kmsKey: SimRoute53KskKmsKey;
  readonly clock: SimClock;
}

/**
 * The key-signing key commands of one simulated Route53 scope.
 *
 * The four operate on the same key-signing key list on the same hosted zone,
 * so they are grouped rather than wired separately on the service facade.
 */
export class SimRoute53KskCommands {
  private readonly scope: SimRoute53DnssecScope;
  private readonly kmsKey: SimRoute53KskKmsKey;
  private readonly clock: SimClock;
  private readonly input = new SimRoute53KskInput();

  constructor(properties: SimRoute53KskCommandsProperties) {
    this.scope = properties.scope;
    this.kmsKey = properties.kmsKey;
    this.clock = properties.clock;
  }

  /**
   * Create a key-signing key for a hosted zone.
   *
   * The DNSSEC parameters are derived here, from the KMS key's real public
   * key, so a test reading the DS record gets the one that key would produce.
   */
  async create(
    command: SimCreateKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimCreateKeySigningKeyCommandOutput> {
    const zone = await this.scope.zoneFor(
      "route53:CreateKeySigningKey",
      command.input.HostedZoneId,
      options,
    );
    const name = this.input.requireName(command.input.Name);
    const key = this.kmsKey.require(command.input.KeyManagementServiceArn);

    const keySigningKey = new SimRoute53KeySigningKey({
      name,
      kmsArn: key.arn,
      hostedZoneId: zone.id,
      zoneName: zone.name,
      publicKeyDer: key.publicKeyDer(),
      status: this.input.requireStatus(command.input.Status),
      createdDate: this.clock.now(),
    });

    zone.dnssec.add(keySigningKey);

    return {
      $metadata: {},
      ChangeInfo: this.scope.changeInfo(zone),
      KeySigningKey: keySigningKey.describe(),
      Location: `/2013-04-01/keysigningkey/${zone.id}/${name}`,
    };
  }

  /**
   * Start signing with a key-signing key.
   */
  async activate(
    command: SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimKeySigningKeyCommandOutput> {
    return await this.changeStatus(
      "route53:ActivateKeySigningKey",
      command,
      options,
      SimRoute53KeySigningKeyStatus.Active,
    );
  }

  /**
   * Stop signing with a key-signing key.
   */
  async deactivate(
    command: SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimKeySigningKeyCommandOutput> {
    return await this.changeStatus(
      "route53:DeactivateKeySigningKey",
      command,
      options,
      SimRoute53KeySigningKeyStatus.Inactive,
    );
  }

  /**
   * Remove a key-signing key from a hosted zone.
   */
  async delete(
    command: SimKeySigningKeyCommand,
    options?: SimRoute53RequestOptions,
  ): Promise<SimKeySigningKeyCommandOutput> {
    const zone = await this.scope.zoneFor(
      "route53:DeleteKeySigningKey",
      command.input.HostedZoneId,
      options,
    );

    zone.dnssec.remove(this.input.requireName(command.input.Name));

    return { $metadata: {}, ChangeInfo: this.scope.changeInfo(zone) };
  }

  private async changeStatus(
    action: string,
    command: SimKeySigningKeyCommand,
    options: SimRoute53RequestOptions | undefined,
    status: SimRoute53KeySigningKeyStatus,
  ): Promise<SimKeySigningKeyCommandOutput> {
    const zone = await this.scope.zoneFor(
      action,
      command.input.HostedZoneId,
      options,
    );
    const keySigningKey = zone.dnssec.require(
      this.input.requireName(command.input.Name),
    );

    this.applyStatus(keySigningKey, status);

    return { $metadata: {}, ChangeInfo: this.scope.changeInfo(zone) };
  }

  private applyStatus(
    keySigningKey: SimRoute53KeySigningKey,
    status: SimRoute53KeySigningKeyStatus,
  ): void {
    if (status === SimRoute53KeySigningKeyStatus.Active) {
      keySigningKey.activate(this.clock.now());

      return;
    }

    keySigningKey.deactivate(this.clock.now());
  }
}
