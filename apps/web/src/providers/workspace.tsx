import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { createContext, useContext, useEffect, useState } from "react";

import { api } from "~/utils/api";

interface WorkspaceContextProps {
  workspace: Workspace;
  isLoading: boolean;
  hasLoaded: boolean;
  switchWorkspace: (_workspace: Workspace) => void;
  availableWorkspaces: Workspace[];
}

interface Workspace {
  name: string;
  description: string | null | undefined;
  publicId: string;
  slug: string | undefined;
  plan: "free" | "team" | "pro" | "enterprise" | undefined;
  role: "admin" | "member" | "guest";
  weekStartDay: 0 | 1 | 6;
  cardPrefix: string;
}

const initialWorkspace: Workspace = {
  name: "",
  description: null,
  publicId: "",
  slug: "",
  plan: "free" as const,
  role: "member",
  weekStartDay: 1,
  cardPrefix: "",
};

const initialAvailableWorkspaces: Workspace[] = [];

export const WorkspaceContext = createContext<
  WorkspaceContextProps | undefined
>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>(
    initialAvailableWorkspaces,
  );
  const [hasLoaded, setHasLoaded] = useState(false);

  const workspacePublicId = useSearchParams().get("workspacePublicId");

  // Reserved first-path segments that are app routes, not workspace slugs.
  const RESERVED_SEGMENTS = [
    "boards",
    "chat",
    "agents",
    "members",
    "templates",
    "settings",
    "cards",
    "login",
    "signup",
    "onboarding",
    "invite",
    "upgrade",
    "pricing",
    "privacy",
    "terms",
    "partner",
    "oss-friends",
    "unsubscribe",
    "api",
  ];
  const pathname = usePathname();
  const firstSegment = pathname?.split("/")[1] ?? "";
  const urlWorkspaceSlug =
    firstSegment && !RESERVED_SEGMENTS.includes(firstSegment)
      ? firstSegment
      : null;

  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(
    workspacePublicId,
  );
  const pollAttemptsRef = React.useRef(0);
  const MAX_POLL_ATTEMPTS = 5;

  const { data, isLoading, isFetching } = api.workspace.all.useQuery(
    undefined,
    {
      refetchInterval: pendingWorkspaceId ? 2000 : false,
    },
  );
  const utils = api.useUtils();

  const switchWorkspace = (_workspace: Workspace) => {
    localStorage.setItem("workspacePublicId", _workspace.publicId);

    setWorkspace(_workspace);

    // Refetch workspace data to ensure availableWorkspaces is up to date
    void utils.workspace.all.refetch();

    router.push(_workspace.slug ? `/${_workspace.slug}/boards` : `/boards`);
  };

  useEffect(() => {
    if (!data?.length) {
      if (!isLoading && !isFetching) setHasLoaded(true);
      return;
    }

    const storedWorkspaceId: string | null =
      workspacePublicId ?? localStorage.getItem("workspacePublicId");

    if (data.length) {
      const workspaces = data.map(({ workspace, role }) => ({
        role,
        publicId: workspace.publicId,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        plan: workspace.plan,
        weekStartDay: workspace.weekStartDay,
        cardPrefix: workspace.cardPrefix,
        hasLoaded: true,
      })) as Workspace[];

      if (workspaces.length) setAvailableWorkspaces(workspaces);
    }

    // If the URL carries a workspace slug (e.g. /reme/boards), select that
    // workspace from the slug and do not redirect.
    if (urlWorkspaceSlug) {
      const bySlug = data.find(
        ({ workspace }) => workspace.slug === urlWorkspaceSlug,
      );
      if (bySlug?.workspace) {
        pollAttemptsRef.current = 0;
        setPendingWorkspaceId(null);
        localStorage.setItem("workspacePublicId", bySlug.workspace.publicId);
        setWorkspace({
          publicId: bySlug.workspace.publicId,
          name: bySlug.workspace.name,
          slug: bySlug.workspace.slug,
          plan: bySlug.workspace.plan,
          description: bySlug.workspace.description,
          role: bySlug.role as "admin" | "member" | "guest",
          weekStartDay: bySlug.workspace.weekStartDay as 0 | 1 | 6,
          cardPrefix: bySlug.workspace.cardPrefix,
        });
        setHasLoaded(true);
        return;
      }
    }

    if (storedWorkspaceId !== null) {
      const selectedWorkspace = data.find(
        ({ workspace }) => workspace.publicId === storedWorkspaceId,
      );

      if (!selectedWorkspace?.workspace) {
        if (pendingWorkspaceId) {
          pollAttemptsRef.current += 1;
          if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
            setPendingWorkspaceId(null);
            localStorage.removeItem("workspacePublicId");
          } else {
            return;
          }
        } else {
          // Clear stale workspacePublicId from localStorage
          localStorage.removeItem("workspacePublicId");
        }
      } else {
        pollAttemptsRef.current = 0;
        setPendingWorkspaceId(null);

        setWorkspace({
          publicId: selectedWorkspace.workspace.publicId,
          name: selectedWorkspace.workspace.name,
          slug: selectedWorkspace.workspace.slug,
          plan: selectedWorkspace.workspace.plan,
          description: selectedWorkspace.workspace.description,
          role: selectedWorkspace.role as "admin" | "member" | "guest",
          weekStartDay: selectedWorkspace.workspace.weekStartDay as 0 | 1 | 6,
          cardPrefix: selectedWorkspace.workspace.cardPrefix,
        });

        if (workspacePublicId) {
          router.push(`/boards`);
          localStorage.setItem("workspacePublicId", workspacePublicId);
        }

        setHasLoaded(true);
        return;
      }
    }

    const primaryWorkspace = data[0]?.workspace;
    const primaryWorkspaceRole = data[0]?.role;

    if (!primaryWorkspace || !primaryWorkspaceRole) return;
    localStorage.setItem("workspacePublicId", primaryWorkspace.publicId);
    setWorkspace({
      publicId: primaryWorkspace.publicId,
      name: primaryWorkspace.name,
      slug: primaryWorkspace.slug,
      plan: primaryWorkspace.plan,
      description: primaryWorkspace.description,
      role: primaryWorkspaceRole as "admin" | "member" | "guest",
      weekStartDay: primaryWorkspace.weekStartDay as 0 | 1 | 6,
      cardPrefix: primaryWorkspace.cardPrefix,
    });
    setHasLoaded(true);
  }, [
    data,
    isLoading,
    isFetching,
    workspacePublicId,
    urlWorkspaceSlug,
    pendingWorkspaceId,
    router,
  ]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
        hasLoaded,
        availableWorkspaces,
        switchWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextProps => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
