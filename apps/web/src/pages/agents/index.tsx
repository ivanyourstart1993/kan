import { useEffect, useState } from "react";

import type { NextPageWithLayout } from "~/pages/_app";
import Button from "~/components/Button";
import { getDashboardLayout } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const AgentsPage: NextPageWithLayout = () => {
  const { workspace } = useWorkspace();
  const workspaceReady =
    !!workspace.publicId && workspace.publicId.length >= 12;
  const wp = { workspacePublicId: workspace.publicId };
  const enabled = { enabled: workspaceReady };
  const utils = api.useUtils();

  // --- Instructions (Markdown) ---
  const { data: instructionsData } = api.agent.getInstructions.useQuery(
    wp,
    enabled,
  );
  const [instructions, setInstructions] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (instructionsData && !dirty)
      setInstructions(instructionsData.instructions);
  }, [instructionsData, dirty]);
  const saveInstructions = api.agent.updateInstructions.useMutation({
    onSuccess: async () => {
      setDirty(false);
      await utils.agent.getInstructions.invalidate(wp);
    },
  });

  // --- Checklist ---
  const { data: tasks } = api.agent.listTasks.useQuery(wp, enabled);
  const [newTask, setNewTask] = useState("");
  const createTask = api.agent.createTask.useMutation({
    onSuccess: async () => {
      setNewTask("");
      await utils.agent.listTasks.invalidate(wp);
    },
  });
  const toggleTask = api.agent.toggleTask.useMutation({
    onSuccess: async () => utils.agent.listTasks.invalidate(wp),
  });

  // --- Agent log ---
  const { data: log } = api.agent.listLog.useQuery(wp, {
    enabled: workspaceReady,
    refetchInterval: 5000,
  });

  return (
    <>
      <PageHead title={`AI-агенты | ${workspace.name ?? ""}`} />
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="flex h-[45px] shrink-0 items-center border-b border-light-300 px-5 dark:border-dark-300">
          <h1 className="font-medium text-neutral-900 dark:text-dark-1000">
            AI-агенты
          </h1>
        </div>

        <div className="space-y-8 px-5 py-6">
          {/* Instructions */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-dark-1000">
                📄 Инструкция для агентов (Markdown)
              </h2>
              <Button
                onClick={() =>
                  saveInstructions.mutate({ ...wp, instructions })
                }
                disabled={!dirty || saveInstructions.isPending}
              >
                Сохранить
              </Button>
            </div>
            <textarea
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setDirty(true);
              }}
              rows={12}
              placeholder="# Как работать с этим проектом&#10;Опишите здесь для агентов: контекст, правила, что делать и как отчитываться…"
              className="w-full resize-y rounded-md border border-light-300 bg-light-50 p-3 font-mono text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-600 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-1000 dark:focus:ring-dark-600"
            />
            <p className="mt-1 text-xs text-light-900 dark:text-dark-800">
              Агент читает её инструментом get_project_instructions.
            </p>
          </section>

          {/* Checklist */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-dark-1000">
              ✅ Чек-лист (агент отмечает выполненное)
            </h2>
            <div className="space-y-1">
              {tasks?.map((task) => (
                <label
                  key={task.publicId}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-light-200 dark:hover:bg-dark-200"
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) =>
                      toggleTask.mutate({
                        ...wp,
                        taskPublicId: task.publicId,
                        completed: e.target.checked,
                      })
                    }
                  />
                  <span
                    className={
                      task.completed
                        ? "text-sm text-light-900 line-through dark:text-dark-800"
                        : "text-sm text-neutral-800 dark:text-dark-900"
                    }
                  >
                    {task.title}
                  </span>
                </label>
              ))}
              {tasks && tasks.length === 0 && (
                <p className="text-sm text-light-900 dark:text-dark-800">
                  Пунктов пока нет.
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTask.trim())
                    createTask.mutate({ ...wp, title: newTask.trim() });
                }}
                placeholder="Новый пункт чек-листа…"
                className="flex-1 rounded-md border border-light-300 bg-light-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-600 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-1000"
              />
              <Button
                onClick={() =>
                  newTask.trim() &&
                  createTask.mutate({ ...wp, title: newTask.trim() })
                }
                disabled={!newTask.trim() || createTask.isPending}
              >
                Добавить
              </Button>
            </div>
          </section>

          {/* Agent log */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-dark-1000">
              🧾 Журнал правок агента
            </h2>
            <div className="space-y-3 rounded-md border border-light-300 p-3 dark:border-dark-300">
              {log && log.length > 0 ? (
                log.map((m) => (
                  <div key={m.publicId} className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-dark-1000">
                        {m.user?.name ?? m.user?.email ?? "Agent"}
                      </span>
                      <span className="text-xs text-light-900 dark:text-dark-800">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-dark-900">
                      {m.content}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-light-900 dark:text-dark-800">
                  Записей пока нет. Сюда агент пишет ключевые правки.
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-light-900 dark:text-dark-800">
              Агент пишет сюда инструментом send_agent_log.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

AgentsPage.getLayout = (page) => getDashboardLayout(page);

export default AgentsPage;
