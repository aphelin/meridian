import type { ReservationDto } from "@meridian/contracts";
import { ServiceOnly, ZodBody } from "@meridian/nest-kit";
import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { CommitReservationCommand, ReleaseReservationCommand, ReserveStockCommand } from "../../application/commands";
import { releaseRequestSchema, reservationRequestSchema } from "./schemas";

/** Service-to-service reservation API used by checkout (service JWT required). */
@Controller("reservations")
@ServiceOnly()
export class ReservationsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(201)
  reserve(@ZodBody(reservationRequestSchema) body: z.output<typeof reservationRequestSchema>): Promise<ReservationDto> {
    return this.commandBus.execute(new ReserveStockCommand(body.orderId, body.lines));
  }

  @Post(":orderId/commit")
  @HttpCode(200)
  commit(@Param("orderId") orderId: string): Promise<ReservationDto> {
    return this.commandBus.execute(new CommitReservationCommand(orderId));
  }

  @Post(":orderId/release")
  @HttpCode(200)
  async release(@Param("orderId") orderId: string, @ZodBody(releaseRequestSchema) body: z.output<typeof releaseRequestSchema>): Promise<ReservationDto> {
    return (await this.commandBus.execute(new ReleaseReservationCommand(orderId, body.reason))) as ReservationDto;
  }
}
