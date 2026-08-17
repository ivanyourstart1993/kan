import { useEffect, useRef, useState } from "react";

import type { NextPageWithLayout } from "~/pages/_app";
import Button from "~/components/Button";
import { getDashboardLayout } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const ChatPage: NextPageWithLayout = () => {
  const { workspace } = useWorkspace();
  const [content, setContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const workspaceReady =
    !!workspace.publicId && workspace.publicId.length >= 12;

  const { data: messages, refetch } = api.chat.list.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: workspaceReady, refetchInterval: 3000 },
  );

  const sendMutation = api.chat.send.useMutation({
    onSuccess: async () => {
      setContent("");
      await refetch();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || !workspaceReady || sendMutation.isPending) return;
    sendMutation.mutate({
      workspacePublicId: workspace.publicId,
      content: trimmed,
    });
  };

  return (
    <>
      <PageHead title={`Чат проекта | ${workspace.name ?? ""}`} />
      <div className="flex h-full flex-col">
        <div className="flex h-[45px] items-center border-b border-light-300 px-5 dark:border-dark-300">
          <h1 className="font-medium text-neutral-900 dark:text-dark-1000">
            Чат проекта
          </h1>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
          {messages && messages.length > 0 ? (
            messages.map((m) => {
              const author =
                m.user?.name ?? m.user?.email ?? "Пользователь";
              return (
                <div key={m.publicId} className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-dark-1000">
                      {author}
                    </span>
                    <span className="text-xs text-light-900 dark:text-dark-800">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-dark-900">
                    {m.content}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-light-900 dark:text-dark-800">
              Сообщений пока нет. Напишите первое 👇
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-light-300 p-4 dark:border-dark-300">
          <div className="flex items-end gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Написать сообщение… (Enter — отправить, Shift+Enter — новая строка)"
              className="min-h-[44px] flex-1 resize-none rounded-md border border-light-300 bg-light-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-600 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-1000 dark:focus:ring-dark-600"
            />
            <Button
              onClick={handleSend}
              disabled={!content.trim() || sendMutation.isPending}
            >
              Отправить
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

ChatPage.getLayout = (page) => getDashboardLayout(page);

export default ChatPage;
