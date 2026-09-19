import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SearchDocumentRepository, type ChangeResult } from "../../domain";
import { ArchiveProductCommand } from "./archive-product.command";

@CommandHandler(ArchiveProductCommand)
export class ArchiveProductHandler implements ICommandHandler<ArchiveProductCommand, ChangeResult> {
  constructor(private readonly documents: SearchDocumentRepository) {}

  /** An archive for a product never indexed changes nothing: there is nothing to hide. */
  execute({ productId, meta }: ArchiveProductCommand): Promise<ChangeResult> {
    return this.documents.change(productId, (current) => current?.archive(meta) ?? null);
  }
}
