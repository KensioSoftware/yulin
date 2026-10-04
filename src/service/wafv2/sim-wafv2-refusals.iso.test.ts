import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type { SimCreateWebAclCommandInput } from "./command/web-acl/web-acl.command.js";
import { SimWafInvalidParameterException } from "./error/sim-wafv2.error.js";
import { createSimWafWebAcl } from "./sim-wafv2.fixture.js";

/**
 * Try to create a web ACL, and answer with whatever it was refused for.
 */
async function refusalFor(
  webAcl: Partial<SimCreateWebAclCommandInput>,
): Promise<Error> {
  const waf = new SimAws().wafV2();

  return await assertThrowsErrorAsync(async () => {
    await createSimWafWebAcl(waf, {
      ...simWafCreateWebAclFactory.make(),
      ...webAcl,
    });
  });
}

describe("SimWafV2 refusals", () => {
  it("refuses a body inspection limit that is not one of the four sizes", async () => {
    // When a web ACL asks for a body inspection limit AWS has no setting for.
    const error = await refusalFor({
      AssociationConfig: {
        RequestBody: { CLOUDFRONT: { DefaultSizeInspectionLimit: "KB_24" } },
      },
    });

    // Then it is refused, the way WAFv2 refuses the value.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "KB_24");
  });

  it("refuses a RequestBody entry that sets no body inspection limit", async () => {
    // When a web ACL names a resource type and says nothing about the limit,
    // which a hand-written template is where this comes from.
    const error = await refusalFor({
      AssociationConfig: { RequestBody: { CLOUDFRONT: undefined } },
    });

    // Then it is refused the way an unusable size is, ahead of the type error
    // reading a limit off nothing would have raised.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "DefaultSizeInspectionLimit");
  });
});
