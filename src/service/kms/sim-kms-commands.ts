import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimKmsAliasCommands } from "./command/alias/sim-kms-alias-commands.js";
import { SimKmsAuthorizer } from "./command/authorize/sim-kms-authorizer.js";
import { SimKmsCryptoCommands } from "./command/crypto/sim-kms-crypto-commands.js";
import { SimKmsGenerateDataKey } from "./command/crypto/sim-kms-generate-data-key.js";
import { SimKmsKeyCommands } from "./command/key/sim-kms-key-commands.js";
import { SimKmsKeyLifecycleCommands } from "./command/key/sim-kms-key-lifecycle-commands.js";
import { SimKmsKeyPolicyCommands } from "./command/key/sim-kms-key-policy-commands.js";
import { SimKmsListKeys } from "./command/key/sim-kms-list-keys.js";
import { SimKmsKeyFactory } from "./key/sim-kms-key-factory.js";
import { SimKmsKeyMetadataView } from "./key/sim-kms-key-metadata.js";
import { SimKmsKeyStore } from "./key/sim-kms-key-store.js";

/**
 * How one simulated KMS is put together.
 */
export interface SimKmsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * The command areas of one simulated KMS, and the state they share.
 *
 * Every command authorizes against the same IAM and works on the same key
 * store, so the wiring lives here rather than being repeated once per command
 * in the service facade. That keeps SimKms what it should be: state plus
 * delegation.
 */
export class SimKmsCommands {
  public readonly keys: SimKmsKeyStore;
  public readonly key: SimKmsKeyCommands;
  public readonly listKeys: SimKmsListKeys;
  public readonly lifecycle: SimKmsKeyLifecycleCommands;
  public readonly policies: SimKmsKeyPolicyCommands;
  public readonly aliases: SimKmsAliasCommands;
  public readonly crypto: SimKmsCryptoCommands;
  public readonly generateDataKey: SimKmsGenerateDataKey;
  public readonly background: BackgroundScheduler;

  constructor(properties: SimKmsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const keyFactory = new SimKmsKeyFactory({
      accountRegionScope,
      clock: background,
    });
    const authorizer = new SimKmsAuthorizer({ iam, accountRegionScope });

    this.background = background;
    this.keys = new SimKmsKeyStore({ accountRegionScope, keyFactory });
    this.key = new SimKmsKeyCommands({
      keys: this.keys,
      keyFactory,
      authorizer,
      metadata: new SimKmsKeyMetadataView(accountRegionScope.accountId),
    });
    this.listKeys = new SimKmsListKeys({ keys: this.keys, authorizer });
    this.lifecycle = new SimKmsKeyLifecycleCommands({
      keys: this.keys,
      authorizer,
      clock: background,
    });
    this.policies = new SimKmsKeyPolicyCommands({
      keys: this.keys,
      authorizer,
    });
    this.aliases = new SimKmsAliasCommands({ keys: this.keys, authorizer });
    this.crypto = new SimKmsCryptoCommands({ keys: this.keys, authorizer });
    this.generateDataKey = new SimKmsGenerateDataKey({
      keys: this.keys,
      authorizer,
    });
  }
}
