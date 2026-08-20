import type { SimWafAssociations } from "../../association/sim-waf-associations.js";
import { requiredSimWafArn } from "../sim-wafv2-input.js";
import type { SimWafRequestOptions } from "../sim-wafv2-request-options.js";
import { simWafWebAclOutput } from "../web-acl/sim-waf-web-acl-output.js";
import type { SimWafAssociationAccess } from "./sim-wafv2-association-access.js";
import { refuseUnsimulatedSimWafResourceType } from "./sim-wafv2-association-input.js";
import type {
  SimAssociateWebAclCommand,
  SimAssociateWebAclCommandOutput,
  SimDisassociateWebAclCommand,
  SimDisassociateWebAclCommandOutput,
  SimGetWebAclForResourceCommand,
  SimGetWebAclForResourceCommandOutput,
  SimListResourcesForWebAclCommand,
  SimListResourcesForWebAclCommandOutput,
} from "./association.command.js";

interface SimWafAssociationCommandsProperties {
  readonly associations: SimWafAssociations;
  readonly access: SimWafAssociationAccess;
}

/**
 * The commands that put a web ACL in front of a resource and take it away
 * again.
 *
 * A resource is named by ARN and nothing else. Reading that ARN for what it
 * names, authorizing the caller and finding the web ACL are all in
 * `sim-wafv2-association-access.ts`, which leaves these four as the operations
 * themselves.
 */
export class SimWafAssociationCommands {
  readonly #associations: SimWafAssociations;
  readonly #access: SimWafAssociationAccess;

  constructor(properties: SimWafAssociationCommandsProperties) {
    this.#associations = properties.associations;
    this.#access = properties.access;
  }

  /**
   * Put a web ACL in front of one resource.
   */
  associateWebAcl(
    command: SimAssociateWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimAssociateWebAclCommandOutput {
    const { input } = command;
    const webAclArn = requiredSimWafArn(input.WebACLArn, "WebACLArn");
    const resource = this.#access.resource(input.ResourceArn);

    this.#access.authorizeWebAcl(
      "wafv2:AssociateWebACL",
      webAclArn,
      options?.caller,
    );

    const webAcl = this.#access.webAcl(webAclArn);

    this.#access.requireResource(resource);
    this.#associations.associate(resource.arn, webAcl);

    return { $metadata: {} };
  }

  /**
   * Take the web ACL in front of one resource away.
   *
   * A resource with no web ACL is left as it is. AWS reports a resource that
   * is not there and says nothing about an association that was never made.
   */
  disassociateWebAcl(
    command: SimDisassociateWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimDisassociateWebAclCommandOutput {
    const resource = this.#access.authorizedResource(
      command.input.ResourceArn,
      "wafv2:DisassociateWebACL",
      options?.caller,
    );

    this.#associations.release(resource.arn);

    return { $metadata: {} };
  }

  /**
   * Read the web ACL in front of one resource.
   *
   * A resource with no web ACL answers with nothing, as AWS does. The question
   * has an answer, and reporting an error for it would be a different one.
   */
  getWebAclForResource(
    command: SimGetWebAclForResourceCommand,
    options?: SimWafRequestOptions,
  ): SimGetWebAclForResourceCommandOutput {
    const resource = this.#access.authorizedResource(
      command.input.ResourceArn,
      "wafv2:GetWebACLForResource",
      options?.caller,
    );
    const webAcl = this.#associations.webAclFor(resource.arn);

    if (webAcl === undefined) {
      return { $metadata: {} };
    }

    return { $metadata: {}, WebACL: simWafWebAclOutput(webAcl) };
  }

  /**
   * List the resources one web ACL is in front of.
   */
  listResourcesForWebAcl(
    command: SimListResourcesForWebAclCommand,
    options?: SimWafRequestOptions,
  ): SimListResourcesForWebAclCommandOutput {
    const { input } = command;
    const webAclArn = requiredSimWafArn(input.WebACLArn, "WebACLArn");

    refuseUnsimulatedSimWafResourceType(input.ResourceType);

    this.#access.authorizeWebAcl(
      "wafv2:ListResourcesForWebACL",
      webAclArn,
      options?.caller,
    );

    return {
      $metadata: {},
      ResourceArns: this.#associations.resourceArnsFor(
        this.#access.webAcl(webAclArn),
      ),
    };
  }
}
