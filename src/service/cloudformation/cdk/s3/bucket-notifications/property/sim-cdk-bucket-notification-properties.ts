import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../template/value/sim-cfn-template-value.js";
import { bucketNotificationsError } from "../error/sim-cdk-bucket-notification-error.js";

/**
 * The properties CDK puts on a Custom::S3BucketNotifications Resource.
 *
 * `ServiceToken` is read and ignored. It points at CDK's own Python provider
 * function, whose whole job is the PutBucketNotificationConfiguration call this
 * factory makes instead.
 */
const knownPropertyNames: ReadonlySet<string> = new Set([
  "BucketName",
  "Managed",
  "NotificationConfiguration",
  "ServiceToken",
  "SkipDestinationValidation",
]);

/**
 * Reads the properties of one Custom::S3BucketNotifications Resource.
 *
 * A property name CDK does not emit is refused rather than ignored. This
 * Resource is a private contract between CDK and its own provider function, so
 * a name that turns up here is a version of CDK asking for something this
 * simulator has not been told about, and quietly dropping it would leave the
 * Bucket configured differently from the app that was deployed.
 */
export class SimCdkBucketNotificationProperties {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.logicalId = logicalId;
    this.properties = properties;

    this.refuseUnknownProperties();
  }

  /**
   * The Bucket the configuration is applied to.
   */
  get bucketName(): string {
    const bucketName = this.properties["BucketName"];

    if (typeof bucketName !== "string" || bucketName === "") {
      throw bucketNotificationsError(
        this.logicalId,
        "BucketName must resolve to a Bucket name",
      );
    }

    return bucketName;
  }

  /**
   * The configuration to apply, still as the template wrote it.
   */
  get notificationConfiguration(): SimCfnTemplateValue | undefined {
    return this.properties["NotificationConfiguration"];
  }

  /**
   * Whether S3 validates the destinations as the configuration is applied.
   */
  get skipDestinationValidation(): boolean {
    return this.flag("SkipDestinationValidation", false);
  }

  /**
   * Refuse a Resource whose configuration CDK does not own outright.
   *
   * `Managed: false` is what CDK emits for a Bucket the app imported rather
   * than declared, and it means merge this configuration with whatever the
   * Bucket already has rather than replace it. Simulated S3 only replaces, so
   * applying it as written would discard configurations that survive on real
   * AWS. Refusing says so at deploy time instead.
   */
  assertManaged(): void {
    if (!this.flag("Managed", true)) {
      throw bucketNotificationsError(
        this.logicalId,
        "Managed is false, which asks S3 to merge this configuration with " +
          "the configurations already on the Bucket rather than replace " +
          "them. Simulated S3 replaces the whole configuration, so the " +
          "merge is not simulated. CDK emits this for a Bucket the app " +
          "imported rather than declared; declare the Bucket in the same " +
          "Stack to get a managed notification configuration",
      );
    }
  }

  /**
   * Read a boolean property.
   *
   * Real CloudFormation stringifies every custom Resource property before the
   * provider function sees it, which is why CDK's own handler compares against
   * the string "true". The template itself carries a JSON boolean, so both are
   * read here.
   */
  private flag(name: string, whenAbsent: boolean): boolean {
    // eslint-disable-next-line security/detect-object-injection -- one of the two flag names this class names itself.
    const value = this.properties[name];

    if (value === undefined) {
      return whenAbsent;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === "false") {
      return value === "true";
    }

    throw bucketNotificationsError(
      this.logicalId,
      `${name} must be true or false`,
    );
  }

  private refuseUnknownProperties(): void {
    for (const name of Object.keys(this.properties)) {
      if (!knownPropertyNames.has(name)) {
        throw bucketNotificationsError(
          this.logicalId,
          `${name} is not a Custom::S3BucketNotifications property this ` +
            "simulation knows about, so it is refused rather than ignored",
        );
      }
    }
  }
}
