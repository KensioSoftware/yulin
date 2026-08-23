import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCfnIgnoredProperties } from "./ignore/sim-cfn-ignored-properties.js";
import type {
  SimCfnIgnoredProperty,
  SimCfnPropertyIgnorer,
} from "./ignore/sim-cfn-ignored-property.type.js";
import { SimCfnResourceTemplateReader } from "./template/sim-cfn-resource-template-reader.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../template/value/sim-cfn-template-value.js";
import { SimCfnResourcePropertyResolver } from "./resolve/property/sim-cfn-resource-property-resolver.js";
import {
  type SimCfnResourceValueAdapter,
  simCfnResourceValueAdapter,
} from "./cfn/sim-cfn-resource-value-adapter.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import type {
  SimCfnResourceResolveContext,
  SimCloudFormationResourceProperties,
} from "./sim-cfn-resource.type.js";

/**
 * What one CloudFormation Resource entry is, apart from what has happened to
 * it.
 *
 * This half of `SimCfnResource` is fixed when the Stack reads its
 * template: which Resource this is, what the template says about it, which
 * other Resources it names, and how it answers Ref and Fn::GetAtt. None of it
 * changes as the Stack deploys or tears down.
 *
 * The lifecycle half lives on SimCfnResource, which extends this. Keeping the
 * two apart is what lets the record stay readable while creation and deletion
 * each carry a full set of states, and it puts the Resource's identity where a
 * service factory can read it without seeing lifecycle controls it should not
 * be calling.
 */
export abstract class SimCfnResourceRecord implements SimCfnPropertyIgnorer {
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly logicalId: string;
  /** The Stack this Resource belongs to, where a generated name comes from. */
  public readonly stackName: string | undefined;
  public readonly template: SimCfnTemplateValueRecord;

  private readonly ignoredPropertyList = new SimCfnIgnoredProperties();
  private readonly resourceTemplateReader: SimCfnResourceTemplateReader;
  private readonly propertyResolver: SimCfnResourcePropertyResolver;
  private readonly resourceLogicalIds: ReadonlySet<string>;

  constructor(properties: SimCloudFormationResourceProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      logicalId = "Resource",
      stackName,
      template = {},
      parameters,
      resourceLogicalIds = new Set(),
      exports,
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.logicalId = logicalId;
    this.stackName = stackName;
    this.template = template;
    this.resourceTemplateReader = new SimCfnResourceTemplateReader(template);
    this.propertyResolver = new SimCfnResourcePropertyResolver({
      parameters,
      exports,
      accountRegionScope: this.accountRegionScope,
      propertyIgnorer: this,
      resourceType: this.type,
    });
    this.resourceLogicalIds = resourceLogicalIds;
  }

  /**
   * The simulated AWS object created for this CloudFormation Resource.
   */
  public abstract get simResource(): object | undefined;

  /**
   * The properties this Resource was created without acting on.
   */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.ignoredPropertyList.all;
  }

  /**
   * The CloudFormation Resource type from the Resource template.
   *
   * E.g. AWS::S3::Bucket
   */
  public get type(): string | undefined {
    return this.resourceTemplateReader.type();
  }

  /**
   * The CloudFormation Resource properties object from the Resource template.
   *
   * Missing or non-object Properties are treated as an empty object by the
   * Resource template reader.
   */
  public get properties(): SimCfnTemplateValueRecord {
    return this.resourceTemplateReader.properties();
  }

  /**
   * The logical IDs of every Resource in the Stack this Resource belongs to.
   *
   * Read by a service that has met a value one of them stands behind, such as
   * an `Fn::GetAtt` on a Resource that had no attribute to answer with.
   */
  public get stackResourceLogicalIds(): ReadonlySet<string> {
    return this.resourceLogicalIds;
  }

  /**
   * The DeletionPolicy attribute from the Resource template, if it has one.
   */
  public get deletionPolicy(): string | undefined {
    return this.resourceTemplateReader.deletionPolicy();
  }

  /**
   * Whether a Stack teardown should leave this Resource where it is.
   *
   * RetainExceptOnCreate differs from Retain only in what a rolled back
   * creation does, and sim CloudFormation does not roll a deployment back, so
   * the two are the same thing here.
   */
  public get retainedOnDelete(): boolean {
    return (
      this.deletionPolicy === "Retain" ||
      this.deletionPolicy === "RetainExceptOnCreate"
    );
  }

  /**
   * The value returned when this Resource is referenced via { "Ref": logicalId }.
   *
   * Mirroring CloudFormation, Resource Ref behavior is Resource-type specific.
   * CloudFormation-specific value behavior is delegated to a Resource adapter so
   * simulated service objects do not need to know about CloudFormation.
   */
  public get refValue(): SimCfnTemplateValue {
    return this.cfnValueAdapter().refValue();
  }

  /**
   * Record that this Resource is being created without acting on a property.
   * Called by the service parsing this Resource's properties, which is the
   * only thing that knows whether a property changes behaviour it simulates.
   */
  ignoreProperty(path: string, reason: string): void {
    this.ignoredPropertyList.record(this, path, reason);
  }

  /**
   * The value returned when this Resource is referenced via Fn::GetAtt.
   *
   * Mirroring CloudFormation, Resource attributes are Resource-type specific.
   * CloudFormation-specific value behavior is delegated to a Resource adapter so
   * simulated service objects do not need to know about CloudFormation.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return this.cfnValueAdapter().attributeValue(attributeName);
  }

  /**
   * Logical IDs of Resources that must complete before this Resource can
   * create.
   *
   * Includes both explicit DependsOn entries and implicit dependencies from Ref
   * expressions that target other Resources.
   */
  dependencies(): string[] {
    return this.resourceTemplateReader.dependencies(this.resourceLogicalIds);
  }

  /**
   * Resolve this Resource's Properties, including Refs to other Resources.
   *
   * Called by the creation operation once every dependency has reached
   * CREATE_COMPLETE, and by the deletion operation while everything this
   * Resource names is still there, so referenced Resources have valid Ref
   * values either way.
   *
   * This is awaited for the sake of the dynamic references a property can
   * hold. A `{{resolve:secretsmanager:...}}` reference decrypts the secret it
   * names through simulated KMS, and the properties are finished once it
   * has.
   */
  async resolvedProperties(
    context: SimCfnResourceResolveContext,
  ): Promise<SimCfnTemplateValueRecord> {
    return await this.propertyResolver.resolve(this.properties, context);
  }

  /**
   * Forget the properties recorded as ignored, for a Resource being created
   * again.
   */
  protected clearIgnoredProperties(): void {
    this.ignoredPropertyList.clear();
  }

  private cfnValueAdapter(): SimCfnResourceValueAdapter {
    return simCfnResourceValueAdapter({
      logicalId: this.logicalId,
      type: this.type,
      simResource: this.simResource,
    });
  }
}
