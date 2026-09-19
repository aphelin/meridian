import { createLogger } from "@meridian/nest-kit";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SearchDocument, SearchDocumentRepository, type ChangeResult } from "../../domain";
import { IndexProductCommand } from "./index-product.command";

const log = createLogger("IndexProduct");

@CommandHandler(IndexProductCommand)
export class IndexProductHandler implements ICommandHandler<IndexProductCommand, ChangeResult> {
  constructor(private readonly documents: SearchDocumentRepository) {}

  async execute({ snapshot, meta }: IndexProductCommand): Promise<ChangeResult> {
    const incoming = SearchDocument.fromSnapshot(snapshot, meta);
    const result = await this.documents.change(incoming.productId, (current) => (incoming.supersedes(current) ? incoming : null));
    if (result === "unchanged") log.info("stale product snapshot ignored", { productId: incoming.productId, messageId: meta.messageId });
    return result;
  }
}
