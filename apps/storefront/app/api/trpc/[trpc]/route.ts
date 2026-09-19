import { handleTrpcRequest } from "@/server/trpc/handler";

const handler = (req: Request) => handleTrpcRequest(req);

export { handler as GET, handler as POST };
