import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimKmsAlreadyExistsException,
  SimKmsNotFoundException,
  SimKmsValidationException,
} from "../error/sim-kms.error.js";
import {
  SimKmsAlias,
  simKmsAliasPrefix,
  simKmsAwsAliasPrefix,
} from "./sim-kms-alias.js";
import {
  SimKmsKeyManager,
  type SimKmsKey,
  type SimKmsKeyId,
} from "./sim-kms-key.js";
import type { SimKmsKeyFactory } from "./sim-kms-key-factory.js";

interface SimKmsKeyStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly keyFactory: SimKmsKeyFactory;
}

/**
 * The keys and aliases of one simulated KMS scope, and how a KeyId resolves.
 *
 * Every KMS operation takes its target as a `KeyId` that may be a key ID, a
 * key ARN, an alias name or an alias ARN, so resolution belongs in one place
 * rather than in each command handler.
 */
export class SimKmsKeyStore {
  public readonly keys = new Map<SimKmsKeyId, SimKmsKey>();
  public readonly aliases = new Map<string, SimKmsAlias>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly keyFactory: SimKmsKeyFactory;

  constructor(properties: SimKmsKeyStoreProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.keyFactory = properties.keyFactory;
  }

  /**
   * Store a newly created key.
   */
  add(key: SimKmsKey): void {
    this.keys.set(key.keyId, key);
  }

  /**
   * Resolve a KeyId to the key it names, or refuse.
   */
  require(keyId: string | undefined): SimKmsKey {
    if (keyId === undefined || keyId === "") {
      throw new SimKmsValidationException("KeyId is required");
    }

    const key = this.find(keyId);

    if (key === undefined) {
      throw new SimKmsNotFoundException(
        `Key '${keyId}' does not exist in Account ${this.accountRegionScope.accountId} Region ${this.accountRegionScope.regionName}`,
      );
    }

    return key;
  }

  /**
   * Resolve a KeyId in any of the forms real KMS accepts.
   *
   * An alias of an AWS managed key resolves to a key created on demand, since
   * that is how such a key comes into existence on real AWS: the service that
   * needs it asks for it, and it appears without anyone creating it.
   */
  find(keyId: string): SimKmsKey | undefined {
    const aliasName = this.aliasNameIn(keyId);

    if (aliasName !== undefined) {
      return this.findByAlias(aliasName);
    }

    return this.keys.get(this.keyIdIn(keyId));
  }

  /**
   * Point an alias at a key, refusing a name already in use.
   */
  addAlias(aliasName: string, targetKey: SimKmsKey): SimKmsAlias {
    if (this.aliases.has(aliasName)) {
      throw new SimKmsAlreadyExistsException(
        `Alias '${aliasName}' already exists`,
      );
    }

    const alias = new SimKmsAlias({
      aliasName,
      targetKeyId: targetKey.keyId,
      accountRegionScope: this.accountRegionScope,
    });

    this.aliases.set(aliasName, alias);

    return alias;
  }

  /**
   * The aliases pointing at one key, or all of them.
   */
  aliasesFor(keyId: SimKmsKeyId | undefined): readonly SimKmsAlias[] {
    const all = this.aliases.values().toArray();

    if (keyId === undefined) {
      return all;
    }

    return all.filter((alias) => alias.targetKeyId === keyId);
  }

  /**
   * Find the key an alias points at, creating an AWS managed key if the alias
   * is a reserved one that has not been used yet.
   */
  private findByAlias(aliasName: string): SimKmsKey | undefined {
    const alias = this.aliases.get(aliasName);

    if (alias !== undefined) {
      return this.keys.get(alias.targetKeyId);
    }

    if (!aliasName.startsWith(simKmsAwsAliasPrefix)) {
      return undefined;
    }

    return this.makeAwsManagedKey(aliasName);
  }

  /**
   * Create an AWS managed key on first reference to its reserved alias.
   */
  private makeAwsManagedKey(aliasName: string): SimKmsKey {
    const key = this.keyFactory.make({
      description: `Default key that protects my ${aliasName.slice(simKmsAwsAliasPrefix.length)} resources when no other key is defined`,
      keyManager: SimKmsKeyManager.Aws,
    });

    this.add(key);
    this.addAlias(aliasName, key);

    return key;
  }

  /**
   * The alias name in a KeyId, whether given bare or as an alias ARN.
   */
  private aliasNameIn(keyId: string): string | undefined {
    if (keyId.startsWith(simKmsAliasPrefix)) {
      return keyId;
    }

    const arnAlias = /:(alias\/.+)$/u.exec(keyId);

    return arnAlias?.[1];
  }

  /**
   * The key ID in a KeyId, whether given bare or as a key ARN.
   */
  private keyIdIn(keyId: string): SimKmsKeyId {
    return /:key\/(.+)$/u.exec(keyId)?.[1] ?? keyId;
  }
}
