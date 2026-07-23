import type { SimRequestCertificateCommand } from "./request-certificate.cmd.js";
import {
  SimAcmInvalidArgsException as SimAcmInvalidArgumentsException,
  SimAcmTooManyTagsException,
} from "../../error/sim-acm.error.js";

/**
 * Validates request-level invariants for ACM RequestCertificate.
 *
 * These checks occur before background sequencing and IAM authorization. This
 * preserves ACM's input-error behavior: malformed requests fail as client
 * errors rather than producing an authorization result, and no certificate
 * state or background work can be created for an invalid request.
 *
 * Certificate construction is not performed here. RequestCertificateFactory
 * remains responsible for translating a validated SDK command into a simulated
 * certificate entity.
 */
export class RequestCertificateValidator {
  /**
   * Ensure the command has the required domain name and an allowed tag count.
   *
   * DomainName is the primary name represented by the resulting certificate.
   * ACM rejects both an omitted value and an empty string. Tags are validated
   * before certificate creation because the request limit applies to the whole
   * request, not to an already-created certificate.
   */
  validate(command: SimRequestCertificateCommand): void {
    if (
      command.input.DomainName === undefined ||
      command.input.DomainName === ""
    ) {
      throw new SimAcmInvalidArgumentsException(
        "RequestCertificateCommand.input.DomainName required",
      );
    }

    if ((command.input.Tags?.length ?? 0) > 50) {
      throw new SimAcmTooManyTagsException(
        "RequestCertificateCommand.input.Tags cannot contain more than 50 tags",
      );
    }
  }
}
