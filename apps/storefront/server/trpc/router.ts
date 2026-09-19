import { router } from "./init";
import { accountRouter, authRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { cartRouter, checkoutRouter, ordersRouter } from "./routers/commerce";
import { contactRouter, newsletterRouter } from "./routers/engagement";
import { alertsRouter, catalogRouter, reviewsRouter, searchRouter, wishlistRouter } from "./routers/shop";

/** The storefront BFF: every procedure of contract revision 2. Browsers call only these; they call the services. */
export const appRouter = router({
  catalog: catalogRouter,
  search: searchRouter,
  reviews: reviewsRouter,
  wishlist: wishlistRouter,
  alerts: alertsRouter,
  auth: authRouter,
  account: accountRouter,
  cart: cartRouter,
  checkout: checkoutRouter,
  orders: ordersRouter,
  newsletter: newsletterRouter,
  contact: contactRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
