import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSsmParameter } from "./sim-ssm-parameter.js";
import { SimSsmParameterArn } from "./sim-ssm-parameter-arn.js";
import type { SimSsmParameterEncryption } from "./sim-ssm-parameter-encryption.js";
import type { SimSsmParameterName } from "./sim-ssm-parameter-name.js";
import { SimSsmParameterOverwrite } from "./sim-ssm-parameter-overwrite.js";
import type { SimSsmParameterStore } from "./sim-ssm-parameter-store.js";
import type { SimSsmParameterType } from "./sim-ssm-parameter-type.js";
import { SimSsmParameterValue } from "./sim-ssm-parameter-value.js";
import type { SimSsmParameterVersion } from "./sim-ssm-parameter-version.js";

/**
 * One write of a parameter, as PutParameter describes it.
 *
 * This is the request rather than what gets stored, which is why it does not
 * share the version's details: the two differ on the key. Here it is whatever
 * the request asked for, and on the version it is the ARN that answered.
 */
export interface SimSsmParameterWrite {
  readonly name: SimSsmParameterName;
  readonly value: string | undefined;
  readonly type: string | undefined;
  readonly overwrite: boolean | undefined;
  readonly description: string | undefined;
  readonly dataType: string | undefined;
  readonly lastModifiedUser: string | undefined;

  /**
   * The key the request asked to encrypt with, in any form KMS accepts: an
   * alias such as `alias/aws/ssm`, a key ID, or a key ARN. Undefined leaves
   * Parameter Store to pick its own AWS managed key.
   */
  readonly keyId: string | undefined;

  /**
   * The caller the KMS call for a SecureString is made as, so that encrypting
   * needs the caller's own `kms:Encrypt` permission on the key.
   */
  readonly caller: SimAwsCaller | undefined;
}

interface SimSsmParameterWriterProperties {
  readonly parameters: SimSsmParameterStore;
  readonly encryption: SimSsmParameterEncryption;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The single path by which a simulated parameter is created or updated.
 *
 * Keeping creation and overwrite in one collaborator is what stops the two
 * drifting apart on the rules that only show up when they meet.
 */
export class SimSsmParameterWriter {
  private readonly parameters: SimSsmParameterStore;
  private readonly encryption: SimSsmParameterEncryption;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;
  private readonly overwrite = new SimSsmParameterOverwrite();

  constructor(properties: SimSsmParameterWriterProperties) {
    this.parameters = properties.parameters;
    this.encryption = properties.encryption;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Write a new version of a parameter, creating it if it is new.
   *
   * Everything is validated and encrypted before anything is stored, so a
   * request refused for its value, or for a key the caller may not encrypt
   * with, leaves no half-made parameter behind.
   */
  async write(request: SimSsmParameterWrite): Promise<SimSsmParameterVersion> {
    const submitted = SimSsmParameterValue.submitted(request.value);
    const existing = this.parameters.find(request.name.value);
    const type = this.overwrite.typeFor(request, existing);

    const stored = await this.encryption.stored(
      type,
      this.arnFor(request.name),
      submitted,
      request.keyId,
      request.caller,
    );
    const parameter = existing ?? this.created(request.name, type);

    return parameter.addVersion(stored.value, this.clock.now(), {
      description: request.description,
      dataType: request.dataType,
      lastModifiedUser: request.lastModifiedUser,
      keyId: stored.keyId,
    });
  }

  /**
   * The ARN the parameter has or is about to have.
   *
   * It is needed before the parameter exists, because it is the encryption
   * context a SecureString value is bound to.
   */
  private arnFor(name: SimSsmParameterName): string {
    return new SimSsmParameterArn({
      resource: name.resource,
      accountRegionScope: this.accountRegionScope,
    }).value;
  }

  private created(
    name: SimSsmParameterName,
    type: SimSsmParameterType,
  ): SimSsmParameter {
    const parameter = new SimSsmParameter({
      name,
      type,
      accountRegionScope: this.accountRegionScope,
    });

    this.parameters.add(parameter);

    return parameter;
  }
}
