import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";

export type SimCloudFrontOriginAccessControlId = Brand<
  string,
  "SimCloudFrontOriginAccessControlId"
>;

/**
 * When CloudFront signs the request it sends to the Origin.
 *
 * `always` signs every request. `never` signs none, which turns the origin
 * access control off without removing it. `no-override` signs a request the
 * viewer did not already sign, and passes a signed one through.
 */
export type SimCloudFrontOriginAccessControlSigningBehavior =
  | "always"
  | "never"
  | "no-override";

/**
 * The kind of Origin an origin access control signs for.
 *
 * CloudFront also signs for MediaStore and MediaPackage V2 Origins, neither of
 * which is modelled, so neither is a value here.
 */
export type SimCloudFrontOriginAccessControlOriginType = "s3" | "lambda";

interface SimCloudFrontOriginAccessControlProperties {
  readonly id?: SimCloudFrontOriginAccessControlId;
  readonly name: string;
  readonly description?: string;
  readonly originType: SimCloudFrontOriginAccessControlOriginType;
  readonly signingBehavior: SimCloudFrontOriginAccessControlSigningBehavior;
}

/**
 * Simulated CloudFront origin access control.
 *
 * An origin access control is attached to an Origin, and it is how a
 * Distribution authenticates to a private Origin: CloudFront signs the Origin
 * request with SigV4 as the CloudFront service principal, and the Origin's own
 * policy grants that principal on the Distribution's ARN. For an S3 Origin that
 * policy is the Bucket policy, and for a Lambda Function URL it is the
 * function's resource policy.
 *
 * `sigv4` is the only protocol CloudFront offers, so it is fixed here rather
 * than stored.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
 */
export class SimCloudFrontOriginAccessControl {
  public readonly id: SimCloudFrontOriginAccessControlId;
  public readonly name: string;
  public readonly description: string | undefined;
  public readonly signingBehavior: SimCloudFrontOriginAccessControlSigningBehavior;

  /**
   * The kind of Origin this origin access control signs for.
   *
   * CloudFront refuses an origin access control attached to an Origin its
   * origin type does not match, so this is checked where an Origin names one
   * rather than only described here.
   */
  public readonly originType: SimCloudFrontOriginAccessControlOriginType;

  /**
   * The protocol CloudFront signs the Origin request with.
   */
  public readonly signingProtocol = "sigv4";

  constructor(properties: SimCloudFrontOriginAccessControlProperties) {
    this.id = properties.id ?? makeOriginAccessControlId();
    this.name = properties.name;
    this.description = properties.description;
    this.originType = properties.originType;
    this.signingBehavior = properties.signingBehavior;
  }

  /**
   * Whether this origin access control signs the request for an Origin read.
   *
   * `no-override` signs a request the viewer did not sign, and nothing here
   * sends a pre-signed viewer request to an Origin, so it signs too.
   */
  get signs(): boolean {
    return this.signingBehavior !== "never";
  }
}

export type SimCloudFrontOriginAccessControlMap = Map<
  SimCloudFrontOriginAccessControlId,
  SimCloudFrontOriginAccessControl
>;

/**
 * Generate a fake sim CloudFront origin access control ID, in the shape
 * CloudFront gives one.
 */
export function makeOriginAccessControlId(): SimCloudFrontOriginAccessControlId {
  return faker.helpers.fromRegExp(
    /E[0-9A-Z]{13}/,
  ) as SimCloudFrontOriginAccessControlId;
}
