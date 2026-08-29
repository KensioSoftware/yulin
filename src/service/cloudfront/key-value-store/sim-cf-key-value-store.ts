import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import { SimCloudFrontPreconditionFailed } from "../error/sim-cf-key-value-store.error.js";
import { makeSimCloudFrontETag } from "../sim-cf-etag.js";
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
  #resourceETag: string;
  #dataETag: string;

  constructor(properties: SimCloudFrontKeyValueStoreProperties) {
    this.id = properties.id ?? makeKeyValueStoreId();
    this.accountId = properties.accountId ?? makeSimAwsAccountId();
    this.#name = properties.name;
    this.#comment = properties.comment;
    this.#status = properties.status ?? "PROVISIONING";
    this.#lastModifiedTime = properties.lastModifiedTime ?? new Date();
    this.createdTime = this.#lastModifiedTime;
    this.#resourceETag = makeKeyValueStoreETag();
    this.#dataETag = makeKeyValueStoreETag();
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
   * The ETag of the resource, which the CloudFront client works against.
   *
   * A store has two ETags and they are not interchangeable, which is what AWS
   * has: each of the two DescribeKeyValueStore operations returns its own, and
   * a write has to carry the one belonging to the API it is calling. This one
   * versions the store's configuration, so a key write does not move it and a
   * comment change does.
   *
   * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions-get-reference.html
   */
  get resourceETag(): string {
    return this.#resourceETag;
  }

  /**
   * The ETag of the data, which the key value store client works against.
   *
   * This one versions the keys, so a key write moves it and a comment change
   * does not. See resourceETag for why there are two.
   */
  get dataETag(): string {
    return this.#dataETag;
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
    this.touchResource();
  }

  /**
   * Refuse a CloudFront client write whose ETag is not the resource's.
   *
   * CloudFront takes IfMatch on every write and refuses a stale one, which is
   * what stops two writers overwriting each other. Yulin enforces it here
   * rather than accepting and ignoring it, so a caller that does not thread the
   * ETag through fails the way it would fail against CloudFront.
   */
  assertResourceETag(ifMatch: string): void {
    this.assertETag(ifMatch, this.#resourceETag, "resource");
  }

  /**
   * Refuse a data API write whose ETag is not the data's.
   */
  assertDataETag(ifMatch: string): void {
    this.assertETag(ifMatch, this.#dataETag, "data");
  }

  /**
   * Record that this store's configuration changed.
   */
  touchResource(lastModifiedTime: Date = new Date()): void {
    this.#lastModifiedTime = lastModifiedTime;
    this.#resourceETag = makeKeyValueStoreETag();
  }

  /**
   * Record that this store's keys changed.
   */
  touchData(lastModifiedTime: Date = new Date()): void {
    this.#lastModifiedTime = lastModifiedTime;
    this.#dataETag = makeKeyValueStoreETag();
  }

  /**
   * Every key and value this store holds.
   */
  listKeys(): readonly SimCloudFrontKeyValuePair[] {
    return this.keys.list();
  }

  /**
   * Refuse a write against the wrong version of one side of the store.
   *
   * The side is named in the message because the two ETags are not
   * interchangeable, and reaching for the other API's ETag is the mistake this
   * is most likely to be catching.
   */
  private assertETag(ifMatch: string, current: string, side: string): void {
    if (ifMatch !== current) {
      throw new SimCloudFrontPreconditionFailed(
        `Sim CloudFront key value store ${this.name} has ${side} ETag ` +
          `${current}, not ${ifMatch}`,
      );
    }
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
  return makeSimCloudFrontETag();
}
