import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

// Markdown instructions for agents, one row per workspace (project)
export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    instructions: text("instructions").notNull().default(""),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_configs_workspace_uidx").on(table.workspaceId),
  ],
);

// Checklist tasks that agents can tick off
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [index("agent_tasks_workspace_idx").on(table.workspaceId)],
);

// Separate agent edit-log channel (distinct from the human "Чат проекта")
export const agentLogMessages = pgTable(
  "agent_log_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("agent_log_workspace_idx").on(table.workspaceId)],
);

export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  user: one(users, {
    fields: [agentTasks.createdBy],
    references: [users.id],
  }),
}));

export const agentLogMessagesRelations = relations(
  agentLogMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [agentLogMessages.createdBy],
      references: [users.id],
    }),
  }),
);
