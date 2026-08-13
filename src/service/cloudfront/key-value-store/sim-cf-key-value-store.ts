import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import { SimCloudFrontPreconditionFailed } from "../error/sim-cloudfront.error.js";
import {
  type SimCloudFrontKeyValuePair,
  SimCloudFrontKeyValueStoreKeys,
} from "./sim-cf-key-value-store-keys.js";

export type SimCloudFrontKeyValueStoreId = Brand<
  string,
  "SimCloudFrontKeyValueStoreId"
>;

/**
 * A key value store is PROVISIONING until CloudFront has it ready to serve.
 */
export type SimCloudFrontKeyValueStoreStatus = "PROVISIONING" | "READY";

interface SimCloudFrontKeyValueStoreProperties {
  readonly id?: SimCloudFrontKeyValueStoreId;
  readonly name: string;
  readonly comment?: string | undefined;
  readonly accountId?: SimAwsAccountId;
  readonly status?: SimCloudFrontKeyValueStoreStatus;
  readonly lastModifiedTime?: Date;
}

/**
 * Simulated CloudFront key value store.
 *
 * A key value store holds data a CloudFront Function reads at request time,
 * which is how a Function gets a redirect table or a feature flag without
 * having the value baked into its code. The Function reads it and never writes
 * to it: writes come from the separate key value store data API.
 *
 * The store is reached through two different SDK clients in AWS, and both are
 * simulated. The CloudFront client owns the resource, so it creates, describes,
 * renames and deletes the store. The key value store client owns the data, so
 * it reads and writes the keys, addressing the store by ARN.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions.html
 */
export class SimCloudFrontKeyValueStore {
  public readonly id: SimCloudFrontKeyValueStoreId;
  public readonly accountId: SimAwsAccountId;
  public readonly keys = new SimCloudFrontKeyValueStoreKeys();

  /**
   * When this key value store was created, which the data API reports and the
   * CloudFront client does not.
   */
  public readonly createdTime: Date;

  #name: string;
  #comment: string | undefined;
  #status: SimCloudFrontKeyValueStoreStatus;
  #lastModifiedTime: Date;
  #eTag: string;

  constructor(properties: SimCloudFrontKeyValueStoreProperties) {
    this.id = properties.id ?? makeKeyValueStoreId();
    this.accountId = properties.accountId ?? makeSimAwsAccountId();
    this.#name = properties.name;
    this.#comment = properties.comment;
    this.#status = properties.status ?? "PROVISIONING";
    this.#lastModifiedTime = properties.lastModifiedTime ?? new Date();
    this.createdTime = this.#lastModifiedTime;
    this.#eTag = makeKeyValueStoreETag();
  }

  /**
   * The name this key value store is known by, which is unique per Account.
   */
  get name(): string {
    return this.#name;
  }

  /**
   * The comment stored with this key value store, if it has one.
   */
  get comment(): string | undefined {
    return this.#comment;
  }

  /**
   * The current status of this key value store.
   */
  get status(): SimCloudFrontKeyValueStoreStatus {
    return this.#status;
  }

  /**
   * When this key value store was last changed, by either API.
   */
  get lastModifiedTime(): Date {
    return this.#lastModifiedTime;
  }

  /**
   * The current ETag, which every write has to match.
   */
  get eTag(): string {
    return this.#eTag;
  }

  /**
   * The ARN for this key value store.
   *
   * CloudFront is a global service, so the Region is empty, the same way a
   * Distribution and a Function ARN have no Region.
   */
  get arn(): SimArn {
    return `arn:aws:cloudfront::${this.accountId}:key-value-store/${this.id}`;
  }

  /**
   * Move this key value store to the READY status.
   */
  ready(): Promise<void> {
    this.#status = "READY";
    return Promise.resolve();
  }

  /**
   * Rename this key value store, or change its comment.
   */
  update(properties: {
    readonly name?: string | undefined;
    readonly comment?: string | undefined;
  }): void {
    this.#name = properties.name ?? this.#name;
    this.#comment = properties.comment ?? this.#comment;
    this.touch();
  }

  /**
   * Refuse a write whose ETag is not the current one.
   *
   * The data API takes IfMatch on every write and CloudFront refuses a stale
   * one, which is what stops two writers overwriting each other. Yulin enforces
   * it rather than accepting and ignoring it, so a caller that does not thread
   * the ETag through fails here the way it would fail against CloudFront.
   */
  assertETag(ifMatch: string): void {
    if (ifMatch !== this.#eTag) {
      throw new SimCloudFrontPreconditionFailed(
        `Sim CloudFront key value store ${this.name} has ETag ${this.#eTag}, not ${ifMatch}`,
      );
    }
  }

  /**
   * Record that this key value store changed, giving it a new ETag.
   */
  touch(lastModifiedTime: Date = new Date()): void {
    this.#lastModifiedTime = lastModifiedTime;
    this.#eTag = makeKeyValueStoreETag();
  }

  /**
   * Every key and value this store holds.
   */
  listKeys(): readonly SimCloudFrontKeyValuePair[] {
    return this.keys.list();
  }
}

export type SimCloudFrontKeyValueStoreMap = Map<
  SimCloudFrontKeyValueStoreId,
  SimCloudFrontKeyValueStore
>;

/**
 * Generate a fake key value store ID, in the shape CloudFront gives one.
 */
export function makeKeyValueStoreId(): SimCloudFrontKeyValueStoreId {
  return faker.string.uuid() as SimCloudFrontKeyValueStoreId;
}

/**
 * Generate a fake ETag, in the shape CloudFront gives one.
 */
export function makeKeyValueStoreETag(): string {
  return faker.helpers.fromRegExp(/E[0-9A-Z]{13}/);
}
