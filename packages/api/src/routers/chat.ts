import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { chatMessages } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

export const chatRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });

      await assertPermission(ctx.db, userId, workspace.id, "workspace:view");

      const messages = await ctx.db.query.chatMessages.findMany({
        where: eq(chatMessages.workspaceId, workspace.id),
        orderBy: [desc(chatMessages.createdAt)],
        limit: 200,
        columns: { publicId: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, email: true, image: true },
          },
        },
      });

      return messages.reverse();
    }),
  send: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        content: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });

      await assertPermission(ctx.db, userId, workspace.id, "comment:create");

      const [result] = await ctx.db
        .insert(chatMessages)
        .values({
          publicId: generateUID(),
          workspaceId: workspace.id,
          content: input.content,
          createdBy: userId,
        })
        .returning({ publicId: chatMessages.publicId });

      return { success: true, publicId: result?.publicId };
    }),
});
