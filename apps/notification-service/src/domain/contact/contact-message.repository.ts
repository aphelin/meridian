import type { ContactMessage } from "./contact-message";

export abstract class ContactMessageRepository {
  abstract add(message: ContactMessage): Promise<void>;
}
