import { faker } from "@faker-js/faker";
import { DynamicFactory } from "@kensio/part-factory";

import { simWafVisibilityConfig } from "../../web-acl/sim-waf-rule.factory.js";
import type { SimCreateWebAclCommandInput } from "./web-acl.command.js";

/**
 * Makes minimally valid CreateWebACL inputs.
 *
 * The web ACL allows what no rule claims and holds no rules at all, so a test
 * adds the rules it is about and says nothing about the rest. Names are
 * generated because a name is unique within a scope, and two tests sharing one
 * would fail each other rather than themselves.
 */
export const simWafCreateWebAclFactory =
  new DynamicFactory<SimCreateWebAclCommandInput>(() => ({
    Name: `acl-${faker.string.alphanumeric(8)}`,
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: simWafVisibilityConfig,
  }));
