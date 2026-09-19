import type { Order } from "../../domain";
import type { OrderAccessTokens } from "../ports";

export interface OrderViewer {
  userId: string;
  role: string | null;
}

export const isAdmin = (viewer: OrderViewer | null): boolean => viewer?.role === "admin";

/** The signed-in owner, or anyone holding the order's access token (guest capability link). */
export function actsAsCustomer(order: Order, viewer: OrderViewer | null, accessToken: string | null, tokens: OrderAccessTokens): boolean {
  if (viewer && order.userId !== null && order.userId === viewer.userId) return true;
  return accessToken !== null && tokens.verify(order.id, accessToken);
}

/** Who may read an order: its owner, an admin, or anyone holding the order's access token. */
export function canViewOrder(order: Order, viewer: OrderViewer | null, accessToken: string | null, tokens: OrderAccessTokens): boolean {
  return isAdmin(viewer) || actsAsCustomer(order, viewer, accessToken, tokens);
}
