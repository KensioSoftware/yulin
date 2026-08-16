import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../../error/sim-ses.error.js";
import type { SimSesTemplateStore } from "../../template/sim-ses-template-store.js";
import type { SimSesReadContent } from "./sim-ses-read-content.js";
import { readSimSesSimpleMessage } from "./sim-ses-simple-content.js";
import { SimSesTemplateSendReader } from "./sim-ses-template-send.js";
import type { SimSesEmailContent } from "./send.command.js";

interface SimSesContentReaderProperties {
  readonly templates: SimSesTemplateStore;
}

/**
 * Reads whichever of the three kinds of content a send carried.
 *
 * `Simple` and `Template` are both read. `Raw` is refused by name: a raw MIME
 * message would have to be parsed to say anything about its subject or body,
 * and recording one with nothing in it would make a test pass for a reason
 * unrelated to what it asserts.
 */
export class SimSesContentReader {
  readonly #templateSends: SimSesTemplateSendReader;

  constructor(properties: SimSesContentReaderProperties) {
    this.#templateSends = new SimSesTemplateSendReader({
      templates: properties.templates,
    });
  }

  /**
   * Read the content of a send, refusing what SES would refuse.
   */
  read(content: SimSesEmailContent | undefined): SimSesReadContent {
    if (content === undefined) {
      throw new SimSesBadRequestException(
        "1 validation error detected: Value at 'content' failed to satisfy " +
          "constraint: Member must not be null",
      );
    }

    if (content.Raw !== undefined) {
      throw new SimSesUnsupportedOperationException(
        "Raw MIME content is not simulated, so SendEmail refuses Content.Raw " +
          "rather than recording a message it has not read",
      );
    }

    if (content.Template !== undefined) {
      return this.#templateSends.read(content.Template);
    }

    if (content.Simple === undefined) {
      throw new SimSesBadRequestException(
        "Content must specify one of Simple, Raw or Template.",
      );
    }

    return readSimSesSimpleMessage(content.Simple);
  }
}
