import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simRestApiReplacePolicy } from "../../api/policy/sim-rest-api-policy.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimCreateRestApiCommandInput } from "../../command/api/rest-api.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";
import { simCfnRestApiSimulatedProperties } from "./sim-cfn-rest-api-property-names.js";
import { SimCfnRestApiPropertyRules } from "./sim-cfn-rest-api-property-rules.js";

interface SimCfnRestApiPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::RestApi CloudFormation properties into the
 * CreateRestApi input the API creator needs, and says whether the Resource
 * declares the API as a document instead.
 *
 * A `Body` is an OpenAPI document declaring the API's resources, methods and
 * integrations. It goes through `ImportRestApi`, the same translator an SDK
 * caller importing a document reaches, so a template and an SDK call produce
 * the same API. `SimCfnRestApiImportProperties` reads the properties that
 * import asks for.
 */
export class SimCfnRestApiProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::RestApi",
    simulated: simCfnRestApiSimulatedProperties,
  });
  private readonly rules: SimCfnRestApiPropertyRules;
  private readonly importable: boolean;

  constructor(properties: SimCfnRestApiPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.rules = new SimCfnRestApiPropertyRules(properties);

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
    this.importable = this.rules.readsBody();
  }

  /**
   * Whether this Resource declares the API as a document this reads.
   */
  imported(): boolean {
    return this.importable;
  }

  /**
   * The resource policy this Resource declares, as the JSON a command takes.
   *
   * A template writes it as an object, and a string holding the JSON is
   * accepted as CloudFormation accepts it.
   */
  policy(): string | undefined {
    const policy = this.properties["Policy"];

    return policy === undefined || typeof policy === "string"
      ? policy
      : JSON.stringify(policy);
  }

  /**
   * Attach the `Policy` of an API declared as a `Body`, as AWS attaches it
   * once the import is done. It replaces a policy the document declared.
   */
  attachImportedPolicy(restApi: SimRestApi): void {
    const policy = this.policy();

    if (policy !== undefined && this.importable) {
      simRestApiReplacePolicy(restApi, policy);
    }
  }

  /**
   * The CreateRestApi input this Resource asks for.
   */
  createRestApiInput(): SimCreateRestApiCommandInput {
    this.rules.ignoreImportOnlyProperties();

    return {
      name: this.propertyParser.requiredString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      disableExecuteApiEndpoint: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["DisableExecuteApiEndpoint"],
        "DisableExecuteApiEndpoint",
      ),
      policy: this.policy(),
    };
  }
}
