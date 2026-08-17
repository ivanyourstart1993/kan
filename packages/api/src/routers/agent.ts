import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import {
  agentConfigs,
  agentLogMessages,
  agentTasks,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

const taskSchema = z.object({
  publicId: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.date(),
});

const logMessageSchema = z.object({
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

async function getWorkspaceOrThrow(
  ctx: any,
  workspacePublicId: string,
  permission: string,
) {
  const userId = ctx.user?.id;
  if (!userId)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not authenticated",
    });

  const workspace = await workspaceRepo.getByPublicId(
    ctx.db,
    workspacePublicId,
  );
  if (!workspace)
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

  await assertPermission(ctx.db, userId, workspace.id, permission as any);
  return { userId, workspace };
}

export const agentRouter = createTRPCRouter({
  getInstructions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get agent instructions",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/agent/instructions",
        description: "Get the Markdown instructions for agents on a project",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.object({ instructions: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "workspace:view",
      );
      const config = await ctx.db.query.agentConfigs.findFirst({
        where: eq(agentConfigs.workspaceId, workspace.id),
        columns: { instructions: true },
      });
      return { instructions: config?.instructions ?? "" };
    }),
  updateInstructions: protectedProcedure
    .meta({
      openapi: {
        summary: "Update agent instructions",
        method: "PUT",
        path: "/workspaces/{workspacePublicId}/agent/instructions",
        description: "Set the Markdown instructions for agents on a project",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        instructions: z.string().max(50000),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "board:create",
      );
      await ctx.db
        .insert(agentConfigs)
        .values({
          workspaceId: workspace.id,
          instructions: input.instructions,
        })
        .onConflictDoUpdate({
          target: agentConfigs.workspaceId,
          set: { instructions: input.instructions, updatedAt: new Date() },
        });
      return { success: true };
    }),
  listTasks: protectedProcedure
    .meta({
      openapi: {
        summary: "List agent tasks",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/agent/tasks",
        description: "List the agent checklist tasks for a project",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.array(taskSchema))
    .query(async ({ ctx, input }) => {
      const { workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "workspace:view",
      );
      return ctx.db.query.agentTasks.findMany({
        where: and(
          eq(agentTasks.workspaceId, workspace.id),
          isNull(agentTasks.deletedAt),
        ),
        orderBy: [agentTasks.id],
        columns: {
          publicId: true,
          title: true,
          completed: true,
          createdAt: true,
        },
      });
    }),
  createTask: protectedProcedure
    .meta({
      openapi: {
        summary: "Create agent task",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/agent/tasks",
        description: "Add a checklist task for agents",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        title: z.string().min(1).max(2000),
      }),
    )
    .output(z.object({ success: z.boolean(), publicId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "board:create",
      );
      const publicId = generateUID();
      await ctx.db.insert(agentTasks).values({
        publicId,
        workspaceId: workspace.id,
        title: input.title,
        createdBy: userId,
      });
      return { success: true, publicId };
    }),
  toggleTask: protectedProcedure
    .meta({
      openapi: {
        summary: "Toggle agent task",
        method: "PUT",
        path: "/workspaces/{workspacePublicId}/agent/tasks/{taskPublicId}",
        description: "Mark an agent task done or not done",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        taskPublicId: z.string().min(12),
        completed: z.boolean(),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "board:create",
      );
      await ctx.db
        .update(agentTasks)
        .set({ completed: input.completed })
        .where(
          and(
            eq(agentTasks.publicId, input.taskPublicId),
            eq(agentTasks.workspaceId, workspace.id),
          ),
        );
      return { success: true };
    }),
  listLog: protectedProcedure
    .meta({
      openapi: {
        summary: "List agent log",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/agent/log",
        description: "List the agent edit-log messages for a project",
        tags: ["Agent"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.array(logMessageSchema))
    .query(async ({ ctx, input }) => {
      const { workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "workspace:view",
      );
      const messages = await ctx.db.query.agentLogMessages.findMany({
        where: eq(agentLogMessages.workspaceId, workspace.id),
        orderBy: [desc(agentLogMessages.createdAt)],
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
  appendLog: protectedProcedure
    .meta({
      openapi: {
        summary: "Append to agent log",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/agent/log",
        description: "Post a key change/edit to the agent edit-log",
        tags: ["Agent"],
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
      const { userId, workspace } = await getWorkspaceOrThrow(
        ctx,
        input.workspacePublicId,
        "comment:create",
      );
      const publicId = generateUID();
      await ctx.db.insert(agentLogMessages).values({
        publicId,
        workspaceId: workspace.id,
        content: input.content,
        createdBy: userId,
      });
      return { success: true, publicId };
    }),
});
