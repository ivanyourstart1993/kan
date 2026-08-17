import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { chatMessages } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

const chatMessageSchema = z.object({
  publicId: z.string(),
  content: z.string(),
  createdAt: z.date(),
  user: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      image: z.string().nullable(),
    })
    .nullable(),
});

export const chatRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List chat messages",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/chat",
        description: "Lists chat messages for a workspace (project)",
        tags: ["Chat"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.array(chatMessageSchema))
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
    .meta({
      openapi: {
        summary: "Send a chat message",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/chat",
        description: "Sends a chat message to a workspace (project)",
        tags: ["Chat"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        content: z.string().min(1).max(4000),
      }),
    )
    .output(z.object({ success: z.boolean(), publicId: z.string() }))
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

      if (!result)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send message",
        });

      return { success: true, publicId: result.publicId };
    }),
});
