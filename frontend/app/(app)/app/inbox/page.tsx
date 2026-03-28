"use client";

import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  Expand,
  Inbox,
  Loader2,
  MessageSquareText,
  Mic,
  Pause,
  Paperclip,
  Play,
  Reply,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Volume2,
  VolumeX,
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsAppFormattedText } from "@/components/shared/whatsapp-formatted-text";
import {
  ConversationRemindersPanel,
  DEFAULT_REMINDER_FORM,
  type ReminderFormState,
} from "@/components/inbox/conversation-reminders-panel";
import {
  ConversationStatusFilter,
  type ConversationStatusFilterValue,
} from "@/components/inbox/conversation-status-filter";
import { ConversationInstanceFilter } from "@/components/inbox/conversation-instance-filter";
import { QuickMessagesDialog } from "@/components/inbox/quick-messages-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { formatManualMessageContent } from "@/lib/message-formatting";
import { canAccess, getRoleLabel } from "@/lib/permissions";
import {
  AuthMeResponse,
  Conversation,
  ConversationEvent,
  ConversationMessage,
  ConversationMessageSender,
  ConversationMessagesPage,
  ConversationReminder,
  ConversationStatusSummary,
  InboxInstance,
  PaginatedResponse,
  Tag,
  UserSummary,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUiStore } from "@/store/ui-store";

const INBOX_REFRESH_INTERVAL = 12000;
const AUDIO_WAVEFORM_BARS = [
  8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14, 20, 30, 18, 14, 24, 18, 28, 20, 16,
  24, 14, 18, 12, 8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14,
];
const INBOX_CONVERSATIONS_PANEL_WIDTH = 296;
const INBOX_DETAILS_PANEL_WIDTH = 320;
const INBOX_COLLAPSED_PANEL_WIDTH = 72;
const MESSAGE_HISTORY_LOAD_THRESHOLD = 96;
const MESSAGE_CONTEXT_MENU_WIDTH = 180;
const MESSAGE_CONTEXT_MENU_COPY_ONLY_HEIGHT = 56;
const MESSAGE_CONTEXT_MENU_WITH_REPLY_HEIGHT = 96;
const MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING = 12;
const ALL_INBOX_INSTANCES_VALUE = "ALL";
const HIDDEN_MEDIA_LABELS = new Set([
  "Imagem",
  "Audio",
  "Video",
  "Figurinha",
  "Documento",
  "Documento anexado",
]);
type ConversationsInfiniteData = InfiniteData<
  PaginatedResponse<Conversation>,
  number
>;

function formatMessageTime(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getConversationMessageTimestamp(
  message: Pick<ConversationMessage, "sentAt" | "createdAt">,
) {
  return message.sentAt ?? message.createdAt;
}

type ConversationTimelineItem =
  | {
      kind: "message";
      key: string;
      timestamp: string;
      dateReference: string;
      sortTimestamp: number;
      sortRank: number;
      message: ConversationMessage;
    }
  | {
      kind: "event";
      key: string;
      timestamp: string;
      dateReference: string;
      sortTimestamp: number;
      sortRank: number;
      label: string;
      tone: "info" | "warning" | "danger";
    };

function getConversationEventMetadata(
  event: ConversationEvent,
): Record<string, unknown> | null {
  if (
    !event.metadata ||
    typeof event.metadata !== "object" ||
    Array.isArray(event.metadata)
  ) {
    return null;
  }

  return event.metadata;
}

function getConversationEventLabel(event: ConversationEvent) {
  const metadata = getConversationEventMetadata(event);

  if (event.type === "CLOSED") {
    if (
      metadata?.triggeredBy === "waiting_auto_close_timeout" ||
      metadata?.closeReason === "UNANSWERED"
    ) {
      return "Conversa encerrada automaticamente";
    }

    return "Conversa encerrada";
  }

  if (event.type === "REOPENED") {
    return "Conversa reaberta";
  }

  if (event.type === "RESOLVED") {
    return "Conversa resolvida";
  }

  return null;
}

function getConversationEventTone(
  event: ConversationEvent,
): "info" | "warning" | "danger" {
  if (event.type === "CLOSED") {
    const metadata = getConversationEventMetadata(event);
    const closeReason =
      metadata?.closeReason && typeof metadata.closeReason === "string"
        ? metadata.closeReason
        : null;

    return closeReason === "UNANSWERED" ? "warning" : "danger";
  }

  return "info";
}

function getConversationEventAnchorMessageId(event: ConversationEvent) {
  const metadata = getConversationEventMetadata(event);

  return metadata?.messageId && typeof metadata.messageId === "string"
    ? metadata.messageId
    : null;
}

function shouldShowDateSeparator(
  items: Array<{
    dateReference: string;
  }>,
  index: number,
) {
  if (index === 0) return true;
  const current = new Date(items[index].dateReference);
  const previous = new Date(items[index - 1].dateReference);
  return current.toDateString() !== previous.toDateString();
}

const STATUS_LABELS: Record<string, string> = {
  ALL: "Todas",
  NEW: "Novo",
  OPEN: "Sem status",
  PENDING: "Pendente",
  IN_PROGRESS: "Em atendimento",
  WAITING: "Aguardando",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
};

function getConversationStatusLabel(
  status: string,
  closeReason?: Conversation["closeReason"],
) {
  if (status === "CLOSED" && closeReason === "UNANSWERED") {
    return "Nao respondido";
  }

  return STATUS_LABELS[status] ?? status;
}

function getContactInitials(name?: string | null) {
  return getNameInitials(name, "CT");
}

function getNameInitials(name?: string | null, fallback = "??") {
  const normalized = name?.trim();

  if (!normalized) {
    return fallback;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function isQrConversation(
  conversation?: Pick<Conversation, "instance"> | null,
) {
  return conversation?.instance?.provider === "WHATSAPP_WEB";
}

function getConversationDisplayPhone(
  conversation?: Pick<Conversation, "contact" | "contactDisplayPhone" | "instance"> | null,
) {
  if (isQrConversation(conversation)) {
    return conversation?.contactDisplayPhone?.trim() || null;
  }

  return (
    conversation?.contactDisplayPhone?.trim() ||
    conversation?.contact.phone?.trim() ||
    null
  );
}

function getConversationSecondaryLabel(
  conversation?: Pick<Conversation, "contact" | "contactDisplayPhone" | "instance"> | null,
) {
  const company = conversation?.contact.company?.trim();

  if (company) {
    return company;
  }

  return getConversationDisplayPhone(conversation);
}

function getConversationContactAvatarUrl(
  conversation?: Pick<Conversation, "contactAvatarUrl" | "instance"> | null,
) {
  return conversation?.contactAvatarUrl?.trim() || null;
}

function shouldShowConversationContactAvatar(
  conversation?: Pick<Conversation, "instance"> | null,
) {
  return conversation?.instance?.provider !== "META_WHATSAPP";
}

function ConversationContactAvatar({
  conversation,
  className,
  fallbackClassName,
}: {
  conversation?: Pick<Conversation, "contact" | "contactAvatarUrl" | "instance"> | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const avatarUrl = getConversationContactAvatarUrl(conversation);

  return (
    <Avatar
      className={cn(
        "shrink-0 rounded-[18px] border-foreground/10 bg-foreground/[0.03]",
        className,
      )}
    >
      <AvatarImage
        src={avatarUrl ?? undefined}
        alt={conversation?.contact.name ?? "Contato"}
      />
      <AvatarFallback
        className={cn(
          "rounded-[18px] bg-foreground/[0.04] text-xs font-semibold text-foreground/82",
          fallbackClassName,
        )}
      >
        {getContactInitials(conversation?.contact.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function normalizeMessageSenderAvatarUrl(
  userId: string,
  avatarUrl?: string | null,
  currentUserId?: string | null,
) {
  const normalizedAvatarUrl = avatarUrl?.trim();

  if (!normalizedAvatarUrl) {
    return null;
  }

  if (
    normalizedAvatarUrl.startsWith("/api/proxy/users/profile/avatar") &&
    currentUserId &&
    userId !== currentUserId
  ) {
    return null;
  }

  return normalizedAvatarUrl;
}

function resolveMessageSenderUser(
  message: ConversationMessage,
  options: {
    currentUser?: Pick<AuthMeResponse, "id" | "name" | "avatarUrl"> | null;
    users?: UserSummary[];
  },
): ConversationMessageSender | null {
  if (message.senderUser?.id) {
    return {
      ...message.senderUser,
      avatarUrl: normalizeMessageSenderAvatarUrl(
        message.senderUser.id,
        message.senderUser.avatarUrl,
        options.currentUser?.id,
      ),
    };
  }

  const senderUserId = message.senderUserId?.trim();

  if (!senderUserId) {
    return null;
  }

  if (options.currentUser?.id === senderUserId) {
    return {
      id: options.currentUser.id,
      name: options.currentUser.name,
      avatarUrl: normalizeMessageSenderAvatarUrl(
        options.currentUser.id,
        options.currentUser.avatarUrl,
        options.currentUser.id,
      ),
    };
  }

  const matchedUser = options.users?.find((user) => user.id === senderUserId);

  if (!matchedUser) {
    return null;
  }

  return {
    id: matchedUser.id,
    name: matchedUser.name,
    avatarUrl: normalizeMessageSenderAvatarUrl(
      matchedUser.id,
      matchedUser.avatarUrl,
      options.currentUser?.id,
    ),
  };
}

function shouldShowMessageSenderAvatar(
  message: ConversationMessage,
  senderUser?: ConversationMessageSender | null,
  nextMessage?: ConversationMessage | null,
  nextSenderUser?: ConversationMessageSender | null,
) {
  if (message.direction !== "OUTBOUND" || !senderUser?.id) {
    return false;
  }

  if (
    nextMessage?.direction === "OUTBOUND" &&
    nextSenderUser?.id === senderUser.id
  ) {
    return false;
  }

  return true;
}

function shouldIgnoreMessageQuoteGesture(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('[data-prevent-message-quote="true"]'))
  );
}

function MessageSenderAvatar({
  senderUser,
}: {
  senderUser?: ConversationMessageSender | null;
}) {
  if (!senderUser) {
    return null;
  }

  return (
    <Avatar className="h-6 w-6 shrink-0 rounded-full border border-foreground/10 bg-[var(--surface-avatar-bg)] shadow-[0_6px_16px_rgba(2,10,22,0.12)]">
      <AvatarImage src={senderUser.avatarUrl ?? undefined} alt={senderUser.name} />
      <AvatarFallback className="rounded-full bg-[var(--surface-avatar-bg)] text-[9px] font-semibold text-foreground/88">
        {getNameInitials(senderUser.name, "EQ")}
      </AvatarFallback>
    </Avatar>
  );
}

function getConversationInstanceLabel(
  conversation?: Pick<Conversation, "instance"> | null,
) {
  const instanceName = conversation?.instance?.name?.trim();

  if (instanceName) {
    return instanceName;
  }

  const instancePhone = conversation?.instance?.phoneNumber?.trim();

  if (instancePhone) {
    return instancePhone;
  }

  return null;
}

function isInboxInstanceAvailableForSwitch(instance: InboxInstance) {
  if (instance.status === "CONNECTED") {
    return true;
  }

  // QR instances can stay usable or still need navigation after transient
  // reconnect states, especially after gateway restarts.
  if (
    instance.provider === "WHATSAPP_WEB" &&
    (instance.status === "SYNCING" || instance.visibleConversationsCount > 0)
  ) {
    return true;
  }

  return instance.visibleConversationsCount > 0;
}

const DEFAULT_CONVERSATION_STATUS_SUMMARY: ConversationStatusSummary = {
  ALL: 0,
  OPEN: 0,
  NEW: 0,
  IN_PROGRESS: 0,
  WAITING: 0,
  RESOLVED: 0,
  CLOSED: 0,
};

type RecordingMimeConfig = {
  mimeType: string;
  extension: string;
};

type MessageContextMenuState = {
  message: ConversationMessage;
  x: number;
  y: number;
};

type InboxPageContentProps = {
  lockedInstanceId?: string | null;
};

export function InboxPageContent({
  lockedInstanceId = null,
}: InboxPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingInitialScrollConversationRef = useRef<string | null>(null);
  const pendingHistoryAnchorRef = useRef<{
    conversationId: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const pendingRecordingActionRef = useRef<"discard" | "send" | null>(null);
  const recordingMimeConfigRef = useRef<RecordingMimeConfig | null>(null);
  const pendingReadConversationIdsRef = useRef(new Map<string, number>());
  const suppressMessageRefetchUntilRef = useRef(0);
  const optimisticMessageIdsRef = useRef(new Map<string, string>());
  const setActiveInboxConversationId = useUiStore(
    (state) => state.setActiveInboxConversationId,
  );
  const setIsViewingLatestInboxMessages = useUiStore(
    (state) => state.setIsViewingLatestInboxMessages,
  );
  const requestedConversationId = searchParams.get("conversationId");
  const requestedInstanceId = searchParams.get("instanceId");
  const effectiveInstanceId = lockedInstanceId ?? requestedInstanceId;
  const isInstanceInbox = Boolean(effectiveInstanceId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ConversationStatusFilterValue>("ALL");
  const conversationsScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [composerMode, setComposerMode] = useState<"reply" | "internal">(
    "reply",
  );
  const [quotedMessageId, setQuotedMessageId] = useState<string | null>(null);
  const [quickMessagesOpen, setQuickMessagesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(
    DEFAULT_REMINDER_FORM,
  );
  const [editingReminderId, setEditingReminderId] = useState<string | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [conversationsPanelCollapsed, setConversationsPanelCollapsed] =
    useState(false);
  const [detailsPanelCollapsed, setDetailsPanelCollapsed] = useState(false);
  const [activeVideoNoteId, setActiveVideoNoteId] = useState<string | null>(
    null,
  );
  const [messageContextMenu, setMessageContextMenu] =
    useState<MessageContextMenuState | null>(null);
  const conversationsQueryKey = useMemo(
    () => ["conversations", search, statusFilter, effectiveInstanceId ?? "all"] as const,
    [effectiveInstanceId, search, statusFilter],
  );

  const conversationsQuery = useInfiniteQuery({
    queryKey: conversationsQueryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      query.set("page", String(pageParam));
      query.set("limit", isInstanceInbox ? "100" : "50");

      if (search) {
        query.set("search", search);
      }

      if (statusFilter !== "ALL") {
        query.set("status", statusFilter);
      }

      if (effectiveInstanceId) {
        query.set("instanceId", effectiveInstanceId);
      }

      return apiRequest<PaginatedResponse<Conversation>>(
        `conversations?${query.toString()}`,
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    refetchInterval: INBOX_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const {
    fetchNextPage: fetchNextConversationPage,
    hasNextPage: hasNextConversationPage,
    isFetchingNextPage: isFetchingNextConversationPage,
  } = conversationsQuery;
  const meQuery = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiRequest<AuthMeResponse>("auth/me"),
  });
  const inboxInstancesQuery = useQuery({
    queryKey: ["conversations-instances"],
    queryFn: () => apiRequest<InboxInstance[]>("conversations/instances"),
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasSyncing = Array.isArray(data) && data.some((instance) => {
        const meta = instance.providerMetadata;
        if (!meta || typeof meta !== "object") return false;
        const job = (meta as Record<string, unknown>).historySyncJob;
        return typeof job === "object" && job !== null && (job as Record<string, unknown>).status === "RUNNING";
      });
      return hasSyncing ? 4000 : INBOX_REFRESH_INTERVAL;
    },
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const conversationSummaryQuery = useQuery({
    queryKey: ["conversations-summary", search, effectiveInstanceId ?? "all"],
    queryFn: () => {
      const query = new URLSearchParams();

      if (search) {
        query.set("search", search);
      }

      if (effectiveInstanceId) {
        query.set("instanceId", effectiveInstanceId);
      }

      return apiRequest<ConversationStatusSummary>(
        `conversations/summary${query.size ? `?${query.toString()}` : ""}`,
      );
    },
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const inboxInstances = useMemo(
    () => inboxInstancesQuery.data ?? [],
    [inboxInstancesQuery.data],
  );
  const syncingInstances = useMemo(
    () =>
      inboxInstances.filter((instance) => {
        const meta = instance.providerMetadata;
        if (!meta || typeof meta !== "object") return false;
        const job = (meta as Record<string, unknown>).historySyncJob;
        if (!job || typeof job !== "object") return false;
        return (job as Record<string, unknown>).status === "RUNNING";
      }),
    [inboxInstances],
  );
  const switchableInboxInstances = useMemo(
    () =>
      inboxInstances.filter((instance) => isInboxInstanceAvailableForSwitch(instance)),
    [inboxInstances],
  );
  const shouldShowInstanceFilter =
    lockedInstanceId
      ? switchableInboxInstances.length > 1
      : switchableInboxInstances.length > 1;
  const visibleInboxInstances = useMemo(
    () => {
      const baseInstances = shouldShowInstanceFilter
        ? switchableInboxInstances
        : inboxInstances;

      if (!effectiveInstanceId) {
        return baseInstances;
      }

      const selectedInstance =
        inboxInstances.find((instance) => instance.id === effectiveInstanceId) ??
        null;

      if (
        !selectedInstance ||
        baseInstances.some((instance) => instance.id === selectedInstance.id)
      ) {
        return baseInstances;
      }

      return [selectedInstance, ...baseInstances];
    },
    [
      effectiveInstanceId,
      inboxInstances,
      shouldShowInstanceFilter,
      switchableInboxInstances,
    ],
  );
  const replaceInstanceFilterQuery = useCallback(
    (nextInstanceId: string) => {
      if (lockedInstanceId) {
        const inboxBasePath = pathname.replace(/\/instancias\/[^/]+$/, "");
        const nextPath =
          nextInstanceId === ALL_INBOX_INSTANCES_VALUE
            ? inboxBasePath
            : `${inboxBasePath}/instancias/${nextInstanceId}`;

        router.replace(nextPath, {
          scroll: false,
        });
        return;
      }

      const params = new URLSearchParams(searchParams.toString());

      if (nextInstanceId === ALL_INBOX_INSTANCES_VALUE) {
        params.delete("instanceId");
      } else {
        params.set("instanceId", nextInstanceId);
      }

      params.delete("conversationId");

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [lockedInstanceId, pathname, router, searchParams],
  );
  const handleInstanceFilterChange = useCallback(
    (nextInstanceId: string) => {
      setSelectedConversationId(null);
      replaceInstanceFilterQuery(nextInstanceId);
    },
    [replaceInstanceFilterQuery],
  );

  useEffect(() => {
    if (
      !requestedInstanceId ||
      shouldShowInstanceFilter ||
      lockedInstanceId ||
      inboxInstancesQuery.isLoading
    ) {
      return;
    }

    const clearInstanceFilter = window.setTimeout(() => {
      replaceInstanceFilterQuery(ALL_INBOX_INSTANCES_VALUE);
    }, 0);

    return () => window.clearTimeout(clearInstanceFilter);
  }, [
    inboxInstancesQuery.isLoading,
    lockedInstanceId,
    replaceInstanceFilterQuery,
    requestedInstanceId,
    shouldShowInstanceFilter,
  ]);

  const isInitialLoading =
    conversationsQuery.isLoading ||
    meQuery.isLoading ||
    conversationSummaryQuery.isLoading;
  const conversationsLoadError =
    conversationsQuery.error instanceof Error
      ? conversationsQuery.error.message
      : conversationSummaryQuery.error instanceof Error
        ? conversationSummaryQuery.error.message
        : null;

  const conversations = useMemo(() => {
    const list =
      conversationsQuery.data?.pages.flatMap((page) => page.data) ?? [];
    return [...list].sort((a, b) => {
      const aTime = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : new Date(a.createdAt).getTime();
      const bTime = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [conversationsQuery.data?.pages]);
  const conversationsTotal =
    conversationsQuery.data?.pages[0]?.meta.total ?? conversations.length;

  useEffect(() => {
    const container = conversationsScrollRef.current;

    if (
      !container ||
      !conversations.length ||
      !hasNextConversationPage ||
      isFetchingNextConversationPage
    ) {
      return;
    }

    if (container.scrollHeight <= container.clientHeight + 48) {
      void fetchNextConversationPage();
    }
  }, [
    conversations.length,
    fetchNextConversationPage,
    hasNextConversationPage,
    isFetchingNextConversationPage,
  ]);
  const activeConversationId = useMemo(() => {
    if (!conversations.length) {
      return null;
    }

    if (
      selectedConversationId &&
      conversations.some(
        (conversation) => conversation.id === selectedConversationId,
      )
    ) {
      return selectedConversationId;
    }

    if (!isDesktopLayout) {
      return null;
    }

    return conversations[0]?.id ?? null;
  }, [conversations, isDesktopLayout, selectedConversationId]);

  const selectedConversationQuery = useQuery({
    queryKey: ["conversation", activeConversationId, "base"],
    enabled: Boolean(activeConversationId),
    queryFn: () =>
      apiRequest<Conversation>(
        `conversations/${activeConversationId}?include=contactTags,events`,
      ),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const conversationMessagesQuery = useInfiniteQuery({
    queryKey: ["conversation", activeConversationId, "messages"],
    enabled: Boolean(activeConversationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiRequest<ConversationMessagesPage>(
        `messages?conversationId=${activeConversationId}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""
        }`,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const conversationDetailsEnabled =
    Boolean(activeConversationId) && (detailsOpen || isDesktopLayout);

  const selectedConversationDetailsQuery = useQuery({
    queryKey: ["conversation", activeConversationId, "details"],
    enabled: conversationDetailsEnabled,
    queryFn: () =>
      apiRequest<Conversation>(
        `conversations/${activeConversationId}?include=details,events`,
      ),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    enabled: Boolean(activeConversationId) || detailsOpen || isDesktopLayout,
    queryFn: () => apiRequest<UserSummary[]>("users"),
  });

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    enabled: detailsOpen || isDesktopLayout,
    queryFn: () => apiRequest<Tag[]>("tags"),
  });

  const updateConversationsCache = useCallback(
    (updater: (items: Conversation[]) => Conversation[]) => {
      queryClient.setQueryData<ConversationsInfiniteData>(
        conversationsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }

          const pageSizes = current.pages.map((page) => page.data.length);
          const updatedItems = updater(current.pages.flatMap((page) => page.data));
          let offset = 0;

          return {
            ...current,
            pages: current.pages.map((page, index) => {
              const nextOffset = offset + pageSizes[index];
              const nextPageItems = updatedItems.slice(offset, nextOffset);
              offset = nextOffset;

              return {
                ...page,
                data: nextPageItems,
              };
            }),
          };
        },
      );
    },
    [conversationsQueryKey, queryClient],
  );

  const updateConversationUnreadState = useCallback(
    (conversationId: string, unreadCount: number) => {
      const updateConversationSnapshot = (queryKey: readonly unknown[]) => {
        queryClient.setQueryData<Conversation | undefined>(
          queryKey,
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              unreadCount,
            };
          },
        );
      };

      updateConversationSnapshot(["conversation", conversationId, "base"]);
      updateConversationSnapshot(["conversation", conversationId, "details"]);

      updateConversationsCache((items) =>
        items.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                unreadCount,
              }
            : conversation,
        ),
      );
    },
    [queryClient, updateConversationsCache],
  );

  const applyOptimisticConversationMessage = (
    conversationId: string,
    message: ConversationMessage,
    options?: {
      preview?: string;
      updateConversationPreview?: boolean;
    },
  ) => {
    if (options?.updateConversationPreview) {
      const updateConversationSnapshot = (queryKey: readonly unknown[]) => {
        queryClient.setQueryData<Conversation | undefined>(
          queryKey,
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              lastMessageAt: getConversationMessageTimestamp(message),
              lastMessagePreview: options.preview,
            };
          },
        );
      };

      updateConversationSnapshot(["conversation", conversationId, "base"]);
      updateConversationSnapshot(["conversation", conversationId, "details"]);
    }

    queryClient.setQueryData<
      InfiniteData<ConversationMessagesPage> | undefined
    >(["conversation", conversationId, "messages"], (current) => {
      if (!current) {
        return current;
      }

      if (!current.pages.length) {
        return {
          ...current,
          pages: [{ items: [message], hasMore: false, nextCursor: null }],
        };
      }

      const [latestPage, ...olderPages] = current.pages;

      return {
        ...current,
        pages: [
          {
            ...latestPage,
            items: [...latestPage.items, message],
          },
          ...olderPages,
        ],
      };
    });

    if (options?.updateConversationPreview) {
      updateConversationsCache((items) => {
        const updatedConversations = items.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                lastMessageAt: getConversationMessageTimestamp(message),
                lastMessagePreview: options.preview,
              }
            : conversation,
        );

        updatedConversations.sort((left, right) => {
          const leftTimestamp = left.lastMessageAt
            ? new Date(left.lastMessageAt).getTime()
            : 0;
          const rightTimestamp = right.lastMessageAt
            ? new Date(right.lastMessageAt).getTime()
            : 0;

          return rightTimestamp - leftTimestamp;
        });

        return updatedConversations;
      });
    }
  };

  const getCachedConversationMessages = useCallback(
    (conversationId: string): ConversationMessage[] => {
      const cachedPages = queryClient.getQueryData<
        InfiniteData<ConversationMessagesPage> | undefined
      >(["conversation", conversationId, "messages"]);

      if (!cachedPages?.pages.length) {
        return [];
      }

      return [...cachedPages.pages].reverse().flatMap((page) => page.items);
    },
    [queryClient],
  );

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest<ConversationMessage>("messages", {
        method: "POST",
        body: {
          conversationId: activeConversationId,
          content: formatManualMessageContent(
            meQuery.data?.name ?? "Equipe",
            messageDraft,
          ),
          quotedMessageId: effectiveQuotedMessageId ?? undefined,
        },
      }),
    onMutate: async () => {
      if (!activeConversationId) {
        return null;
      }

      // Suppress SSE-triggered message refetches for 5 seconds to avoid
      // replacing optimistic data before onSuccess can swap it
      suppressMessageRefetchUntilRef.current = Date.now() + 5000;

      const formattedContent = formatManualMessageContent(
        meQuery.data?.name ?? "Equipe",
        messageDraft,
      );
      const cachedMessages =
        getCachedConversationMessages(activeConversationId);
      const optimisticQuotedMessage = effectiveQuotedMessageId
        ? (cachedMessages.find(
            (message) => message.id === effectiveQuotedMessageId,
          ) ?? null)
        : null;
      const optimisticMessage: ConversationMessage = {
        id: `optimistic-${Date.now()}`,
        direction: "OUTBOUND",
        messageType: "text",
        content: formattedContent,
        metadata: buildQuoteMetadataForComposer(optimisticQuotedMessage),
        senderUser: {
          id: meQuery.data?.id ?? "me",
          name: meQuery.data?.name ?? "Equipe",
          avatarUrl: meQuery.data?.avatarUrl ?? null,
        },
        status: "QUEUED",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      const conversationSnapshots = queryClient.getQueriesData<
        Conversation | undefined
      >({
        queryKey: ["conversation", activeConversationId],
      });
      const conversationsSnapshot = queryClient.getQueryData<
        ConversationsInfiniteData
      >(conversationsQueryKey);

      await queryClient.cancelQueries({
        queryKey: ["conversation", activeConversationId],
      });
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey });

      applyOptimisticConversationMessage(
        activeConversationId,
        optimisticMessage,
        {
          preview: formattedContent,
          updateConversationPreview: true,
        },
      );

      return {
        activeConversationId,
        conversationSnapshots,
        conversationsSnapshot,
      };
    },
    onSuccess: async (message) => {
      setComposerMode("reply");
      setMessageDraft("");
      setQuotedMessageId(null);

      if (message.metadata?.windowClosedTemplateReply) {
        toast.success(
          "Mensagem enviada via template aprovado porque a janela de 24 horas estava fechada.",
        );
      }

      // Replace optimistic message with real server data but KEEP
      // the optimistic ID so the React key stays stable (no unmount/remount flash)
      const convId = activeConversationId;
      if (convId) {
        queryClient.setQueryData<
          InfiniteData<ConversationMessagesPage> | undefined
        >(["conversation", convId, "messages"], (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => {
                if (item.id.startsWith("optimistic-")) {
                  // Track mapping so SSE refetches can deduplicate
                  optimisticMessageIdsRef.current.set(message.id, item.id);
                  // Keep the optimistic ID for stable React key,
                  // but update all other fields with real server data
                  return { ...message, id: item.id };
                }
                return item;
              }),
            })),
          };
        });
      }

      // Mark conversations as stale (polling will refresh them)
      queryClient.invalidateQueries({
        queryKey: ["conversations"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-summary"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-instances"],
        refetchType: "none",
      });
      // Refetch conversation base/details but NOT messages
      if (convId) {
        queryClient.invalidateQueries({
          queryKey: ["conversation", convId, "base"],
        });
        queryClient.invalidateQueries({
          queryKey: ["conversation", convId, "details"],
        });
        // Schedule a delayed messages sync after cooldown expires
        // to get real IDs and any server-side changes
        setTimeout(() => {
          suppressMessageRefetchUntilRef.current = 0;
          optimisticMessageIdsRef.current.clear();
          void queryClient.invalidateQueries({
            queryKey: ["conversation", convId, "messages"],
          });
        }, 5500);
      }
    },
    onError: (error: Error, _variables, context) => {
      suppressMessageRefetchUntilRef.current = 0;
      if (context?.activeConversationId) {
        for (const [queryKey, value] of context.conversationSnapshots) {
          queryClient.setQueryData(queryKey, value);
        }

        queryClient.setQueryData(
          conversationsQueryKey,
          context.conversationsSnapshot,
        );
      }

      toast.error(error.message);
    },
  });

  const markConversationAsReadMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest<{ success: boolean; changed: boolean }>(
        `conversations/${conversationId}/read`,
        {
          method: "POST",
        },
      ),
    onMutate: async (conversationId) => {
      const conversationSnapshots = queryClient.getQueriesData<
        Conversation | undefined
      >({
        queryKey: ["conversation", conversationId],
      });
      const conversationsSnapshot = queryClient.getQueryData<
        ConversationsInfiniteData
      >(conversationsQueryKey);

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["conversation", conversationId],
        }),
        queryClient.cancelQueries({ queryKey: conversationsQueryKey }),
      ]);

      updateConversationUnreadState(conversationId, 0);

      return {
        conversationId,
        conversationSnapshots,
        conversationsSnapshot,
      };
    },
    onSuccess: async (_result, conversationId) => {
      // Mark as stale — polling picks up the change
      queryClient.invalidateQueries({
        queryKey: ["conversations"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-summary"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-instances"],
        refetchType: "none",
      });
      // Only refresh base/details, not messages
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "base"],
      });
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "details"],
      });
    },
    onError: (error: Error, conversationId, context) => {
      if (context) {
        for (const [queryKey, value] of context.conversationSnapshots) {
          queryClient.setQueryData(queryKey, value);
        }

        queryClient.setQueryData(
          conversationsQueryKey,
          context.conversationsSnapshot,
        );
      }

      toast.error(error.message);
    },
  });

  const sendMediaMutation = useMutation({
    mutationFn: async (payload?: {
      file?: File;
      caption?: string;
      isVoiceNote?: boolean;
    }) => {
      const file = payload?.file ?? selectedFile;

      if (!activeConversationId || !file) {
        throw new Error("Selecione um arquivo para enviar.");
      }

      const formData = new FormData();
      formData.append("conversationId", activeConversationId);
      formData.append("file", file);

      const caption = payload?.caption ?? messageDraft.trim();

      if (caption) {
        formData.append(
          "caption",
          formatManualMessageContent(meQuery.data?.name ?? "Equipe", caption),
        );
      }

      if (payload?.isVoiceNote) {
        formData.append("isVoiceNote", "true");
      }

      if (effectiveQuotedMessageId) {
        formData.append("quotedMessageId", effectiveQuotedMessageId);
      }

      return apiRequest("messages/media", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async () => {
      setComposerMode("reply");
      setMessageDraft("");
      setQuotedMessageId(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Mark conversations as stale (polling will refresh them)
      queryClient.invalidateQueries({
        queryKey: ["conversations"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-summary"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["conversations-instances"],
        refetchType: "none",
      });
      // Refetch messages to pick up the new media message
      if (activeConversationId) {
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        });
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        });
        // For media, we need to refetch messages since there's no optimistic update
        await queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "messages"],
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/notes`, {
        method: "POST",
        body: { content: noteDraft },
      }),
    onSuccess: async () => {
      setNoteDraft("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
      ]);
      toast.success("Nota registrada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendInternalMessageMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest<ConversationMessage>("messages/internal", {
        method: "POST",
        body: {
          conversationId: activeConversationId,
          content,
        },
      }),
    onMutate: async (content) => {
      if (!activeConversationId) {
        return null;
      }

      suppressMessageRefetchUntilRef.current = Date.now() + 5000;

      const trimmedContent = content.trim();
      const now = new Date().toISOString();
      const optimisticMessage: ConversationMessage = {
        id: `optimistic-internal-${Date.now()}`,
        direction: "SYSTEM",
        messageType: "internal_note",
        content: trimmedContent,
        senderUser: {
          id: meQuery.data?.id ?? "me",
          name: meQuery.data?.name ?? "Equipe",
          avatarUrl: meQuery.data?.avatarUrl ?? null,
        },
        metadata: {
          internalMessage: {
            scope: "WORKSPACE",
            authorUserId: meQuery.data?.id ?? null,
            authorName: meQuery.data?.name ?? null,
            label: "Mensagem interna",
          },
        },
        status: "SENT",
        sentAt: now,
        createdAt: now,
      };
      const conversationSnapshots = queryClient.getQueriesData<
        Conversation | undefined
      >({
        queryKey: ["conversation", activeConversationId],
      });

      await queryClient.cancelQueries({
        queryKey: ["conversation", activeConversationId],
      });

      applyOptimisticConversationMessage(
        activeConversationId,
        optimisticMessage,
      );

      return {
        activeConversationId,
        conversationSnapshots,
      };
    },
    onSuccess: async (message) => {
      setComposerMode("reply");
      setMessageDraft("");
      setQuotedMessageId(null);
      shouldStickToBottomRef.current = true;

      // Replace optimistic internal message with real server data
      // but keep the optimistic ID for stable React key
      const convId = activeConversationId;
      if (convId) {
        queryClient.setQueryData<
          InfiniteData<ConversationMessagesPage> | undefined
        >(["conversation", convId, "messages"], (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => {
                if (item.id.startsWith("optimistic-")) {
                  optimisticMessageIdsRef.current.set(message.id, item.id);
                  return { ...message, id: item.id };
                }
                return item;
              }),
            })),
          };
        });
        // Refresh base/details but not messages
        queryClient.invalidateQueries({
          queryKey: ["conversation", convId, "base"],
        });
        queryClient.invalidateQueries({
          queryKey: ["conversation", convId, "details"],
        });
        // Delayed sync to get real IDs
        setTimeout(() => {
          optimisticMessageIdsRef.current.clear();
          void queryClient.invalidateQueries({
            queryKey: ["conversation", convId, "messages"],
          });
        }, 5500);
      }
      toast.success("Mensagem interna registrada no chat.");
    },
    onError: (error: Error, _variables, context) => {
      if (context?.activeConversationId) {
        for (const [queryKey, value] of context.conversationSnapshots) {
          queryClient.setQueryData(queryKey, value);
        }
      }

      toast.error(error.message);
    },
  });

  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      if (!activeConversationId) {
        throw new Error("Selecione uma conversa antes de salvar o lembrete.");
      }

      if (!reminderForm.messageToSend.trim()) {
        throw new Error("Informe a mensagem planejada para o cliente.");
      }

      if (!reminderForm.date || !reminderForm.time) {
        throw new Error("Defina data e hora para o lembrete.");
      }

      return apiRequest(
        editingReminderId
          ? `conversations/${activeConversationId}/reminders/${editingReminderId}`
          : `conversations/${activeConversationId}/reminders`,
        {
          method: editingReminderId ? "PATCH" : "POST",
          body: {
            messageToSend: reminderForm.messageToSend.trim(),
            internalDescription:
              reminderForm.internalDescription.trim() || undefined,
            remindAt: `${reminderForm.date}T${reminderForm.time}`,
          },
        },
      );
    },
    onSuccess: async () => {
      setReminderForm(DEFAULT_REMINDER_FORM);
      setEditingReminderId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(
        editingReminderId ? "Lembrete atualizado." : "Lembrete criado.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeReminderMutation = useMutation({
    mutationFn: (reminderId: string) =>
      apiRequest(
        `conversations/${activeConversationId}/reminders/${reminderId}/complete`,
        {
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success("Lembrete concluído.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelReminderMutation = useMutation({
    mutationFn: (reminderId: string) =>
      apiRequest(
        `conversations/${activeConversationId}/reminders/${reminderId}/cancel`,
        {
          method: "POST",
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success("Lembrete cancelado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateConversationMutation = useMutation({
    mutationFn: (payload: { assignedUserId?: string; tagIds?: string[] }) =>
      apiRequest(`conversations/${activeConversationId}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations-summary"] }),
        queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
      ]);
      toast.success("Conversa atualizada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resolveConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/resolve`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations-summary"] }),
        queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-performance"] }),
      ]);
      toast.success("Conversa marcada como resolvida.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const closeConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/close`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations-summary"] }),
        queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-performance"] }),
      ]);
      toast.success("Conversa encerrada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reopenConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/reopen`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations-summary"] }),
        queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "base"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId, "details"],
        }),
      ]);
      toast.success("Conversa reaberta.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const conversationMessages = useMemo(
    () =>
      [...(conversationMessagesQuery.data?.pages ?? [])]
        .reverse()
        .flatMap((page) => page.items),
    [conversationMessagesQuery.data?.pages],
  );
  const selectedConversation = useMemo(() => {
    const baseConversation = selectedConversationQuery.data;
    const detailsConversation = selectedConversationDetailsQuery.data;

    if (!baseConversation) {
      return detailsConversation
        ? {
            ...detailsConversation,
            messages: conversationMessages,
          }
        : undefined;
    }

    if (!detailsConversation) {
      return {
        ...baseConversation,
        messages: conversationMessages,
      };
    }

    return {
      ...baseConversation,
      ...detailsConversation,
      contact: {
        ...baseConversation.contact,
        ...detailsConversation.contact,
      },
      assignedUser:
        detailsConversation.assignedUser ?? baseConversation.assignedUser,
      tags: detailsConversation.tags ?? baseConversation.tags,
      messages: conversationMessages,
      events: detailsConversation.events ?? baseConversation.events,
      notes: detailsConversation.notes ?? baseConversation.notes,
      reminders: detailsConversation.reminders ?? baseConversation.reminders,
    } satisfies Conversation;
  }, [
    conversationMessages,
    selectedConversationDetailsQuery.data,
    selectedConversationQuery.data,
  ]);
  const activeConversationListItem = useMemo(
    () =>
      activeConversationId
        ? (conversations.find(
            (conversation) => conversation.id === activeConversationId,
          ) ?? null)
        : null,
    [activeConversationId, conversations],
  );
  const activeConversationUnreadCount = Math.max(
    activeConversationListItem?.unreadCount ?? 0,
    selectedConversationQuery.data?.unreadCount ?? 0,
    selectedConversationDetailsQuery.data?.unreadCount ?? 0,
  );

  const isConversationLoading =
    Boolean(activeConversationId) &&
    !selectedConversation &&
    (selectedConversationQuery.isLoading ||
      selectedConversationDetailsQuery.isLoading ||
      conversationMessagesQuery.isLoading);
  const isConversationsPanelMinimized =
    isDesktopLayout && conversationsPanelCollapsed;
  const isDetailsPanelMinimized = isDesktopLayout && detailsPanelCollapsed;
  const desktopInboxGridStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isDesktopLayout) {
      return undefined;
    }

    return {
      gridTemplateColumns: `${isConversationsPanelMinimized ? INBOX_COLLAPSED_PANEL_WIDTH : INBOX_CONVERSATIONS_PANEL_WIDTH}px minmax(0, 1fr) ${isDetailsPanelMinimized ? INBOX_COLLAPSED_PANEL_WIDTH : INBOX_DETAILS_PANEL_WIDTH}px`,
    };
  }, [isConversationsPanelMinimized, isDetailsPanelMinimized, isDesktopLayout]);

  const selectedTagIds = useMemo(
    () => selectedConversation?.tags.map((tag) => tag.id) ?? [],
    [selectedConversation],
  );
  const quotedMessage = useMemo(
    () =>
      quotedMessageId
        ? (selectedConversation?.messages?.find(
            (message) => message.id === quotedMessageId,
          ) ?? null)
        : null,
    [quotedMessageId, selectedConversation?.messages],
  );
  const effectiveQuotedMessageId = quotedMessage?.id ?? null;
  const latestSelectedMessageId = selectedConversation?.messages?.length
    ? selectedConversation.messages[selectedConversation.messages.length - 1]
        ?.id
    : null;
  const selectedConversationMessages = useMemo(
    () => selectedConversation?.messages ?? [],
    [selectedConversation?.messages],
  );
  const closeMessageContextMenu = useCallback(() => {
    setMessageContextMenu(null);
  }, []);

  const handleCopyMessage = useCallback(
    async (message: ConversationMessage) => {
      closeMessageContextMenu();

      const textToCopy = getCopyableMessageText(message);

      if (!textToCopy) {
        toast.error("Nao ha texto disponivel para copiar nesta mensagem.");
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        toast.success("Mensagem copiada.");
      } catch {
        toast.error("Nao foi possivel copiar a mensagem.");
      }
    },
    [closeMessageContextMenu],
  );

  const handleReplyToMessage = useCallback(
    (message: ConversationMessage) => {
      closeMessageContextMenu();

      if (!canQuoteMessage(message)) {
        return;
      }

      setQuotedMessageId(message.id);
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
      });
    },
    [closeMessageContextMenu],
  );

  const openMessageContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, message: ConversationMessage) => {
      event.preventDefault();

      const menuHeight = canQuoteMessage(message)
        ? MESSAGE_CONTEXT_MENU_WITH_REPLY_HEIGHT
        : MESSAGE_CONTEXT_MENU_COPY_ONLY_HEIGHT;
      const maxX =
        window.innerWidth -
        MESSAGE_CONTEXT_MENU_WIDTH -
        MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING;
      const maxY =
        window.innerHeight -
        menuHeight -
        MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING;

      setMessageContextMenu({
        message,
        x: Math.max(
          MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING,
          Math.min(event.clientX, maxX),
        ),
        y: Math.max(
          MESSAGE_CONTEXT_MENU_VIEWPORT_PADDING,
          Math.min(event.clientY, maxY),
        ),
      });
    },
    [],
  );

  useEffect(() => {
    if (!messageContextMenu) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMessageContextMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMessageContextMenu);
    window.addEventListener("scroll", closeMessageContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMessageContextMenu);
      window.removeEventListener("scroll", closeMessageContextMenu, true);
    };
  }, [closeMessageContextMenu, messageContextMenu]);

  useEffect(() => {
    setActiveInboxConversationId(activeConversationId);

    if (!activeConversationId) {
      setIsViewingLatestInboxMessages(false);
    }
  }, [
    activeConversationId,
    setActiveInboxConversationId,
    setIsViewingLatestInboxMessages,
  ]);

  useEffect(
    () => () => {
      setActiveInboxConversationId(null);
      setIsViewingLatestInboxMessages(false);
    },
    [setActiveInboxConversationId, setIsViewingLatestInboxMessages],
  );

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    if (activeConversationUnreadCount <= 0) {
      pendingReadConversationIdsRef.current.delete(activeConversationId);
      return;
    }

    if (
      pendingReadConversationIdsRef.current.get(activeConversationId) ===
      activeConversationUnreadCount
    ) {
      return;
    }

    pendingReadConversationIdsRef.current.set(
      activeConversationId,
      activeConversationUnreadCount,
    );
    markConversationAsReadMutation.mutate(activeConversationId);
  }, [
    activeConversationId,
    activeConversationUnreadCount,
    markConversationAsReadMutation,
  ]);

  const conversationTimelineItems = useMemo<ConversationTimelineItem[]>(() => {
    if (!selectedConversation) {
      return [];
    }

    const items: ConversationTimelineItem[] = [];
    const sortedMessagesByTime = [...selectedConversationMessages].sort(
      (left, right) =>
        new Date(getConversationMessageTimestamp(left)).getTime() -
        new Date(getConversationMessageTimestamp(right)).getTime(),
    );
    const messagesById = new Map(
      sortedMessagesByTime.map((message) => [message.id, message]),
    );
    const lifecycleEvents = [...(selectedConversation.events ?? [])]
      .filter((event) => Boolean(getConversationEventLabel(event)))
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
    const autoMessageEvents = [...(selectedConversation.events ?? [])]
      .filter((event) => event.type === "AUTO_MESSAGE_SENT")
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
    const conversationCreatedAt = new Date(
      selectedConversation.createdAt,
    ).getTime();

    if (selectedConversation.createdAt) {
      items.push({
        kind: "event",
        key: `conversation-opened-${selectedConversation.id}`,
        timestamp: selectedConversation.createdAt,
        dateReference: selectedConversation.createdAt,
        sortTimestamp: conversationCreatedAt,
        sortRank: 0,
        label: "Conversa aberta",
        tone: "info",
      });
    }

    for (const [eventIndex, event] of lifecycleEvents.entries()) {
      const label = getConversationEventLabel(event);

      if (!label) {
        continue;
      }

      const eventTime = new Date(event.createdAt).getTime();
      const nextLifecycleEventTime =
        eventIndex < lifecycleEvents.length - 1
          ? new Date(lifecycleEvents[eventIndex + 1].createdAt).getTime()
          : Number.POSITIVE_INFINITY;
      let sortTimestamp = eventTime;
      let dateReference = event.createdAt;
      let sortRank = event.type === "REOPENED" ? 0 : 2;

      if (event.type === "REOPENED") {
        const metadata = getConversationEventMetadata(event);

        if (metadata?.triggeredBy === "customer_message") {
          const previousLifecycleEventTime =
            eventIndex > 0
              ? new Date(lifecycleEvents[eventIndex - 1].createdAt).getTime()
              : conversationCreatedAt;
          const triggerMessage = sortedMessagesByTime.find((message) => {
            if (message.direction !== "INBOUND") {
              return false;
            }

            const messageTime = new Date(
              getConversationMessageTimestamp(message),
            ).getTime();

            return (
              messageTime >= previousLifecycleEventTime &&
              messageTime <= eventTime + 5 * 60_000
            );
          });

          if (triggerMessage) {
            dateReference = getConversationMessageTimestamp(triggerMessage);
            sortTimestamp = new Date(dateReference).getTime();
            sortRank = 0;
          }
        }
      }

      if (event.type === "CLOSED" || event.type === "RESOLVED") {
        const expectedAutoMessageType =
          event.type === "CLOSED" ? "FINAL_CLOSED" : "FINAL_RESOLVED";
        const anchorAutoEvent = autoMessageEvents.find((candidate) => {
          const candidateTime = new Date(candidate.createdAt).getTime();
          const metadata = getConversationEventMetadata(candidate);

          return (
            candidateTime >= eventTime &&
            candidateTime < nextLifecycleEventTime &&
            metadata?.result === "SENT" &&
            metadata?.autoMessageType === expectedAutoMessageType
          );
        });
        const anchorMessageId = anchorAutoEvent
          ? getConversationEventAnchorMessageId(anchorAutoEvent)
          : null;
        const anchorMessage =
          (anchorMessageId ? messagesById.get(anchorMessageId) : null) ??
          sortedMessagesByTime.find((message) => {
            const messageTime = new Date(
              getConversationMessageTimestamp(message),
            ).getTime();

            return (
              message.direction === "SYSTEM" &&
              message.isAutomated &&
              message.autoMessageType === expectedAutoMessageType &&
              messageTime >= eventTime &&
              messageTime < nextLifecycleEventTime
            );
          });

        if (anchorMessage) {
          dateReference = getConversationMessageTimestamp(anchorMessage);
          sortTimestamp = new Date(dateReference).getTime();
          sortRank = 2;
        }
      }

      items.push({
        kind: "event",
        key: `conversation-event-${event.id}`,
        timestamp: event.createdAt,
        dateReference,
        sortTimestamp,
        sortRank,
        label,
        tone: getConversationEventTone(event),
      });
    }

    for (const message of selectedConversationMessages) {
      const timestamp = getConversationMessageTimestamp(message);

      items.push({
        kind: "message",
        key: message.id,
        timestamp,
        dateReference: timestamp,
        sortTimestamp: new Date(timestamp).getTime(),
        sortRank: 1,
        message,
      });
    }

    return items.sort((left, right) => {
      const timestampDiff = left.sortTimestamp - right.sortTimestamp;

      if (timestampDiff !== 0) {
        return timestampDiff;
      }

      return left.sortRank - right.sortRank;
    });
  }, [selectedConversation, selectedConversationMessages]);
  const hasMoreHistory = Boolean(conversationMessagesQuery.hasNextPage);
  const isFetchingHistory = conversationMessagesQuery.isFetchingNextPage;

  const isNearBottom = (container: HTMLDivElement) => {
    const threshold = 80;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    );
  };

  const scrollMessagesToBottom = () => {
    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const updateLayout = () => setIsDesktopLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!requestedConversationId) {
      return;
    }

    const syncConversationId = window.setTimeout(() => {
      setSelectedConversationId(requestedConversationId);
    }, 0);

    return () => window.clearTimeout(syncConversationId);
  }, [requestedConversationId]);

  useEffect(() => {
    const resetPanels = window.setTimeout(() => {
      setReminderForm(DEFAULT_REMINDER_FORM);
      setEditingReminderId(null);
      setDetailsOpen(false);
      setQuickMessagesOpen(false);
      setComposerMode("reply");
      setQuotedMessageId(null);
      setActiveVideoNoteId(null);
      pendingHistoryAnchorRef.current = null;
    }, 0);

    return () => window.clearTimeout(resetPanels);
  }, [activeConversationId]);

  useLayoutEffect(() => {
    pendingInitialScrollConversationRef.current = activeConversationId;
    shouldStickToBottomRef.current = true;
    pendingHistoryAnchorRef.current = null;
    setIsViewingLatestInboxMessages(Boolean(activeConversationId));
  }, [activeConversationId, setIsViewingLatestInboxMessages]);

  useLayoutEffect(() => {
    if (!selectedConversation?.id) {
      return;
    }

    if (
      pendingInitialScrollConversationRef.current !== selectedConversation.id
    ) {
      return;
    }

    if (
      conversationMessagesQuery.isLoading &&
      selectedConversationMessages.length === 0
    ) {
      return;
    }

    shouldStickToBottomRef.current = true;

    let immediateTimeout = 0;
    let settleTimeout = 0;
    let finalizeTimeout = 0;
    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();

      immediateTimeout = window.setTimeout(scrollMessagesToBottom, 0);
      settleTimeout = window.setTimeout(scrollMessagesToBottom, 120);
      finalizeTimeout = window.setTimeout(() => {
        scrollMessagesToBottom();
        pendingInitialScrollConversationRef.current = null;
      }, 320);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(immediateTimeout);
      window.clearTimeout(settleTimeout);
      window.clearTimeout(finalizeTimeout);
    };
  }, [
    conversationMessagesQuery.isLoading,
    selectedConversation?.id,
    selectedConversationMessages.length,
  ]);

  useLayoutEffect(() => {
    const anchor = pendingHistoryAnchorRef.current;
    const container = messagesScrollRef.current;

    if (
      !anchor ||
      !container ||
      anchor.conversationId !== selectedConversation?.id
    ) {
      return;
    }

    container.scrollTop =
      container.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
    pendingHistoryAnchorRef.current = null;
  }, [selectedConversation?.id, selectedConversation?.messages?.length]);

  useEffect(() => {
    const container = messagesScrollRef.current;

    if (!container) {
      setIsViewingLatestInboxMessages(false);
      return;
    }

    const updateStickiness = () => {
      const isViewingLatestMessages = isNearBottom(container);
      shouldStickToBottomRef.current = isViewingLatestMessages;
      setIsViewingLatestInboxMessages(
        Boolean(selectedConversation?.id) && isViewingLatestMessages,
      );
    };

    const handleScroll = () => {
      updateStickiness();

      if (
        container.scrollTop <= MESSAGE_HISTORY_LOAD_THRESHOLD &&
        hasMoreHistory &&
        !isFetchingHistory &&
        selectedConversation?.id
      ) {
        pendingHistoryAnchorRef.current = {
          conversationId: selectedConversation.id,
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
        };
        void conversationMessagesQuery.fetchNextPage();
      }
    };

    updateStickiness();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => container.removeEventListener("scroll", handleScroll);
  }, [
    conversationMessagesQuery,
    hasMoreHistory,
    isFetchingHistory,
    selectedConversation?.id,
    setIsViewingLatestInboxMessages,
  ]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      return;
    }

    const isComposerFocused =
      typeof document !== "undefined" &&
      document.activeElement === composerTextareaRef.current;

    if (!shouldStickToBottomRef.current && !isComposerFocused) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    selectedConversation?.id,
    selectedConversation?.messages?.length,
    latestSelectedMessageId,
  ]);

  useEffect(() => {
    if (!isRecording || recordingPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingDuration((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording, recordingPaused]);

  useEffect(() => {
    const eventSource = new EventSource("/api/proxy/conversations/stream");

    const handleInboxEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          conversationId?: string;
          type?: string;
        };

        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({
          queryKey: ["conversations-summary"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        });

        if (
          payload.conversationId &&
          payload.conversationId === activeConversationId
        ) {
          const shouldForceStatusRefresh =
            payload.type === "conversation.message.status.updated";
          // Skip message refetch if a send mutation is in progress
          // to avoid replacing optimistic data and causing flicker
          const isSendCooldown =
            Date.now() < suppressMessageRefetchUntilRef.current;
          if (!isSendCooldown || shouldForceStatusRefresh) {
            void queryClient.invalidateQueries({
              queryKey: ["conversation", activeConversationId, "messages"],
            });
          }
          void queryClient.invalidateQueries({
            queryKey: ["conversation", activeConversationId, "base"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["conversation", activeConversationId, "details"],
          });
        }
      } catch {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({
          queryKey: ["conversations-summary"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["conversations-instances"],
        });
      }
    };

    eventSource.addEventListener(
      "inbox-event",
      handleInboxEvent as EventListener,
    );

    return () => {
      eventSource.removeEventListener(
        "inbox-event",
        handleInboxEvent as EventListener,
      );
      eventSource.close();
    };
  }, [activeConversationId, queryClient]);

  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        pendingRecordingActionRef.current = "discard";
        recorder.stop();
      }

      stopRecordingStream(recordingStreamRef);
    },
    [],
  );

  const submitComposer = () => {
    if (
      !activeConversationId ||
      sendMediaMutation.isPending ||
      (isInternalComposerMode
        ? sendInternalMessageMutation.isPending
        : sendMutation.isPending || isConversationClosed)
    ) {
      return;
    }

    shouldStickToBottomRef.current = true;

    if (selectedFile) {
      sendMediaMutation.mutate(undefined);
      return;
    }

    if (!messageDraft.trim()) {
      return;
    }

    if (isInternalComposerMode) {
      sendInternalMessageMutation.mutate(messageDraft);
      return;
    }

    sendMutation.mutate();
  };

  const toggleInternalComposerMode = () => {
    if (!activeConversationId || sendInternalMessageMutation.isPending) {
      return;
    }

    if (selectedFile) {
      toast.error(
        "Remova o anexo atual antes de registrar uma mensagem interna.",
      );
      return;
    }

    if (isRecording) {
      toast.error(
        "Finalize a gravação atual antes de usar a mensagem interna.",
      );
      return;
    }

    setComposerMode((current) =>
      current === "internal" ? "reply" : "internal",
    );
    setQuotedMessageId(null);
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitComposer();
  };

  const startAudioRecording = async () => {
    if (!activeConversationId) {
      toast.error("Selecione uma conversa antes de gravar.");
      return;
    }

    if (selectedFile) {
      toast.error("Envie ou remova o arquivo atual antes de gravar.");
      return;
    }

    setComposerMode("reply");

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Seu navegador nao suporta gravacao de audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeConfig = getPreferredRecordingMimeType();
      const recorder = mimeConfig?.mimeType
        ? new MediaRecorder(stream, { mimeType: mimeConfig.mimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingMimeConfigRef.current =
        mimeConfig ??
        inferRecordingMimeConfig(recorder.mimeType || "audio/webm");
      pendingRecordingActionRef.current = null;
      setRecordingDuration(0);
      setRecordingPaused(false);
      setIsRecording(true);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const action = pendingRecordingActionRef.current;
        const mimeType =
          recorder.mimeType ||
          recordingMimeConfigRef.current?.mimeType ||
          "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const fileName = `voice-note-${Date.now()}.${
          recordingMimeConfigRef.current?.extension ?? "webm"
        }`;
        const file = new File([blob], fileName, { type: mimeType });

        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        recordingMimeConfigRef.current = null;
        pendingRecordingActionRef.current = null;
        setIsRecording(false);
        setRecordingPaused(false);
        setRecordingDuration(0);
        stopRecordingStream(recordingStreamRef);

        if (action !== "send" || blob.size === 0) {
          return;
        }

        void sendMediaMutation.mutateAsync({
          file,
          caption: "",
          isVoiceNote: true,
        });
      });

      recorder.start(250);
    } catch {
      stopRecordingStream(recordingStreamRef);
      toast.error("Nao foi possivel acessar o microfone.");
    }
  };

  const toggleRecordingPause = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingPaused(true);
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      setRecordingPaused(false);
    }
  };

  const finishRecording = (action: "discard" | "send") => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    pendingRecordingActionRef.current = action;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const permissionMap = meQuery.data?.permissionMap;
  const canManageQuickMessages = canAccess(
    permissionMap,
    "CONFIGURE_AUTO_MESSAGES",
  );
  const canTransferConversation = canAccess(
    permissionMap,
    "TRANSFER_CONVERSATION",
  );
  const canResolveConversation = canAccess(
    permissionMap,
    "RESOLVE_CONVERSATION",
  );
  const canCloseConversation = canAccess(permissionMap, "CLOSE_CONVERSATION");
  const canReopenConversation = canAccess(permissionMap, "REOPEN_CONVERSATION");
  const isConversationClosed =
    selectedConversation?.status === "RESOLVED" ||
    selectedConversation?.status === "CLOSED";
  const isInternalComposerMode = composerMode === "internal";
  const canToggleInternalComposerMode =
    Boolean(activeConversationId) && !sendInternalMessageMutation.isPending;

  const refreshConversationQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["conversations-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["conversations-instances"] }),
      queryClient.invalidateQueries({
        queryKey: ["conversation", activeConversationId, "base"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["conversation", activeConversationId, "details"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["conversation", activeConversationId, "messages"],
      }),
    ]);
  };

  const startReminderEdit = (reminder: ConversationReminder) => {
    setEditingReminderId(reminder.id);
    setReminderForm({
      messageToSend: reminder.messageToSend,
      internalDescription: reminder.internalDescription ?? "",
      date: reminder.remindAt.slice(0, 10),
      time: reminder.remindAt.slice(11, 16),
    });
  };

  const clearReminderEditor = () => {
    setEditingReminderId(null);
    setReminderForm(DEFAULT_REMINDER_FORM);
  };

  if (isInitialLoading) {
    return <InboxPageSkeleton />;
  }

  return (
    <div
      className="grid h-full min-h-0 overflow-hidden gap-3 xl:gap-4 xl:grid-cols-[296px_minmax(0,1fr)_320px] xl:transition-[grid-template-columns] xl:duration-300 xl:ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={desktopInboxGridStyle}
    >
      <Card
        className={cn(
          "h-full min-h-0 overflow-hidden p-0",
          activeConversationId ? "hidden xl:block" : "",
        )}
      >
        {isConversationsPanelMinimized ? (
          <CardContent className="hidden h-full min-h-0 flex-col items-center gap-4 p-2 xl:flex">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-11 w-11 rounded-2xl"
              onClick={() => setConversationsPanelCollapsed(false)}
              title="Expandir conversas"
              aria-label="Expandir conversas"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-foreground/10 bg-foreground/[0.02] px-2 py-4 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Inbox className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Inbox
                </p>
                <span className="inline-flex min-w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-1 text-[12px] font-medium text-foreground/82">
                  {conversationSummaryQuery.data?.ALL ?? conversations.length}
                </span>
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="relative shrink-0 border-b border-border p-3.5 sm:p-4">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-3.5 top-3.5 hidden h-10 w-10 shrink-0 rounded-2xl xl:inline-flex"
                onClick={() => setConversationsPanelCollapsed(true)}
                title="Minimizar conversas"
                aria-label="Minimizar conversas"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                  <ConversationStatusFilter
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                    counts={
                      conversationSummaryQuery.data ?? {
                        ...DEFAULT_CONVERSATION_STATUS_SUMMARY,
                        ALL:
                          conversationsTotal ?? conversations.length,
                      }
                    }
                  />
              </div>
              {shouldShowInstanceFilter ? (
                <div className="mt-3">
                  <ConversationInstanceFilter
                    value={effectiveInstanceId}
                    onValueChange={(nextInstanceId) =>
                      handleInstanceFilterChange(
                        nextInstanceId ?? ALL_INBOX_INSTANCES_VALUE,
                      )
                    }
                    instances={visibleInboxInstances}
                    isFetching={inboxInstancesQuery.isFetching}
                  />
                </div>
              ) : null}
              {syncingInstances.length > 0 ? (
                <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5">
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-foreground">
                      Sincronizando historico
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {syncingInstances.map((i) => i.name).join(", ")} &mdash; as conversas aparecem conforme chegam
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar contato, telefone ou trecho"
                  className="pl-11"
                />
              </div>
            </div>

            <div
              ref={conversationsScrollRef}
              className="min-h-0 flex-1 overflow-y-auto p-2.5"
              onScroll={(event) => {
                const container = event.currentTarget;

                if (
                  hasNextConversationPage &&
                  !isFetchingNextConversationPage &&
                  !conversationsQuery.isLoading &&
                  !conversationsQuery.isFetching &&
                  container.scrollTop + container.clientHeight >=
                    container.scrollHeight - 180
                ) {
                  void fetchNextConversationPage();
                }
              }}
            >
              {conversationsLoadError ? (
                <EmptyState
                  icon={Inbox}
                  title="Erro ao carregar conversas"
                  description={conversationsLoadError}
                />
              ) : conversations.length ? (
                <div className="space-y-1.5">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      className={`w-full rounded-[22px] border px-3.5 py-3.5 text-left transition ${
                        activeConversationId === conversation.id
                          ? "border-primary/40 bg-primary-soft"
                          : "border-transparent bg-foreground/[0.03] hover:border-border"
                      }`}
                      onClick={() => setSelectedConversationId(conversation.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          {shouldShowConversationContactAvatar(conversation) ? (
                            <ConversationContactAvatar
                              conversation={conversation}
                              className="mt-0.5 h-11 w-11"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {conversation.contact.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {getConversationSecondaryLabel(conversation) ? (
                                <span>{getConversationSecondaryLabel(conversation)}</span>
                              ) : null}
                              {getConversationInstanceLabel(conversation) ? (
                                <Badge variant="secondary">
                                  {getConversationInstanceLabel(conversation)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(conversation.lastMessageAt)}
                          </span>
                          <div className="mt-2">
                            <StatusBadge
                              status={conversation.status}
                              closeReason={conversation.closeReason}
                            />
                          </div>
                        </div>
                      </div>
                      <p className="mt-2.5 line-clamp-2 text-sm text-foreground/78">
                        {conversation.lastMessagePreview ??
                          "Sem mensagens recentes"}
                      </p>
                      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                          {conversation.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag.id} variant="secondary">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {conversation.assignedUser ? (
                            <span className="text-[11px] text-muted-foreground">
                              {conversation.status === "WAITING"
                                ? `Último responsável: ${conversation.assignedUser.name}`
                                : `Responsável: ${conversation.assignedUser.name}`}
                            </span>
                          ) : null}
                          {conversation.unreadCount ? (
                            <Badge>{conversation.unreadCount}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                  {isFetchingNextConversationPage ? (
                    <div className="flex items-center justify-center py-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Carregando mais conversas...
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={
                    isInstanceInbox
                      ? "Nenhuma conversa nesta instancia"
                      : "Nenhuma conversa aqui"
                  }
                  description={
                    isInstanceInbox
                      ? "Depois da sincronizacao, as conversas desta instancia aparecerao apenas nesta tela separada."
                      : "As conversas aparecerao assim que entrarem pelo canal configurado."
                  }
                />
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3.5 py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">
                {conversationsTotal} conversa{conversationsTotal === 1 ? "" : "s"}
              </p>
              {hasNextConversationPage ? (
                <span className="text-[11px] text-muted-foreground">
                  Role para carregar mais
                </span>
              ) : null}
            </div>
          </CardContent>
        )}
      </Card>

      <Card
        className={cn(
          "h-full min-h-0 overflow-hidden p-0",
          !activeConversationId ? "hidden xl:block" : "",
        )}
      >
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          {isConversationLoading ? (
            <ChatConversationLoadingState />
          ) : selectedConversation ? (
            <>
              <div className="shrink-0 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="mt-0.5 shrink-0 xl:hidden"
                      onClick={() => setSelectedConversationId(null)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {shouldShowConversationContactAvatar(selectedConversation) ? (
                      <ConversationContactAvatar
                        conversation={selectedConversation}
                        className="mt-0.5 h-11 w-11"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <h2 className="font-heading text-[18px] font-semibold">
                        {selectedConversation.contact.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {getConversationSecondaryLabel(selectedConversation) ? (
                          <span>
                            {getConversationSecondaryLabel(selectedConversation)}
                          </span>
                        ) : null}
                        {selectedConversation.instance ? (
                          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-foreground/8 bg-foreground/[0.04] px-2.5 py-1 text-[11px] text-foreground/85">
                            <span className="truncate">
                              {getConversationInstanceLabel(
                                selectedConversation,
                              ) ?? selectedConversation.instance.name}
                            </span>
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {selectedConversation.assignedUser
                          ? `Responsável atual: ${selectedConversation.assignedUser.name} (${getRoleLabel(
                              selectedConversation.assignedUser
                                .normalizedRole ??
                                selectedConversation.assignedUser.role,
                            )})`
                          : selectedConversation.status === "WAITING"
                            ? "Disponível para retomada por qualquer vendedor liberado."
                            : "Ainda sem responsável definido."}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="xl:hidden"
                      onClick={() => setDetailsOpen(true)}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <StatusBadge
                      status={selectedConversation.status}
                      closeReason={selectedConversation.closeReason}
                    />
                  </div>
                </div>
              </div>

              <div className="sticky top-0 z-10 border-b border-border bg-background/92 px-3.5 py-2.5 backdrop-blur xl:hidden sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !canResolveConversation ||
                      isConversationClosed ||
                      resolveConversationMutation.isPending
                    }
                    onClick={() => resolveConversationMutation.mutate()}
                  >
                    Resolver
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !canCloseConversation ||
                      isConversationClosed ||
                      closeConversationMutation.isPending
                    }
                    onClick={() => closeConversationMutation.mutate()}
                  >
                    Encerrar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={
                      !canReopenConversation ||
                      !isConversationClosed ||
                      reopenConversationMutation.isPending
                    }
                    onClick={() => reopenConversationMutation.mutate()}
                  >
                    Reabrir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Detalhes
                  </Button>
                </div>
              </div>

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(10,30,60,0.3),transparent_70%)] px-3 py-3 sm:px-4"
              >
                {hasMoreHistory && !isFetchingHistory ? (
                  <div className="flex items-center justify-center pb-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full border border-border/70 bg-[var(--surface-context-menu)]/70 px-3 text-[11px] text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground"
                      onClick={() => {
                        const container = messagesScrollRef.current;

                        if (!container || !selectedConversation.id) {
                          return;
                        }

                        pendingHistoryAnchorRef.current = {
                          conversationId: selectedConversation.id,
                          scrollHeight: container.scrollHeight,
                          scrollTop: container.scrollTop,
                        };
                        void conversationMessagesQuery.fetchNextPage();
                      }}
                    >
                      Carregar mensagens anteriores
                    </Button>
                  </div>
                ) : null}

                {isFetchingHistory ? (
                  <div className="flex items-center justify-center py-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-[var(--surface-context-menu)]/80 px-3 py-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando mensagens anteriores...
                    </span>
                  </div>
                ) : null}

                {conversationMessagesQuery.isLoading &&
                selectedConversationMessages.length === 0 ? (
                  <div className="space-y-3 py-4">
                    <MessageBubbleSkeleton align="start" />
                    <MessageBubbleSkeleton align="end" />
                    <MessageBubbleSkeleton align="start" />
                  </div>
                ) : null}

                {conversationTimelineItems.map((item, index) => {
                  if (item.kind === "event") {
                    return (
                      <div key={item.key}>
                        {shouldShowDateSeparator(
                          conversationTimelineItems,
                          index,
                        ) && (
                          <div className="my-3 flex items-center justify-center first:mt-0">
                            <span className="rounded-lg bg-[var(--surface-bubble-inbound)]/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                              {getDateLabel(item.timestamp)}
                            </span>
                          </div>
                        )}
                        <ConversationTimelineEvent
                          label={item.label}
                          timestamp={item.timestamp}
                          tone={item.tone}
                        />
                      </div>
                    );
                  }

                  const { message } = item;
                  const internalMessage = resolveInternalMessageMetadata(
                    message.metadata,
                  );
                  const resolvedSenderUser = resolveMessageSenderUser(message, {
                    currentUser: meQuery.data,
                    users: usersQuery.data,
                  });
                  const fallbackQrSenderUser =
                    !resolvedSenderUser &&
                    message.direction === "OUTBOUND" &&
                    isQrConversation(selectedConversation) &&
                    meQuery.data
                      ? {
                          id: meQuery.data.id,
                          name: meQuery.data.name,
                          avatarUrl: normalizeMessageSenderAvatarUrl(
                            meQuery.data.id,
                            meQuery.data.avatarUrl,
                            meQuery.data.id,
                          ),
                        }
                      : null;
                  const senderAvatarUser =
                    resolvedSenderUser ?? fallbackQrSenderUser;
                  const nextTimelineItem = conversationTimelineItems[index + 1];
                  const nextMessage =
                    nextTimelineItem?.kind === "message"
                      ? nextTimelineItem.message
                      : null;
                  const nextResolvedSenderUser = nextMessage
                    ? resolveMessageSenderUser(nextMessage, {
                        currentUser: meQuery.data,
                        users: usersQuery.data,
                      })
                    : null;
                  const nextFallbackQrSenderUser =
                    !nextResolvedSenderUser &&
                    nextMessage?.direction === "OUTBOUND" &&
                    isQrConversation(selectedConversation) &&
                    meQuery.data
                      ? {
                          id: meQuery.data.id,
                          name: meQuery.data.name,
                          avatarUrl: normalizeMessageSenderAvatarUrl(
                            meQuery.data.id,
                            meQuery.data.avatarUrl,
                            meQuery.data.id,
                          ),
                        }
                      : null;
                  const nextSenderAvatarUser =
                    nextResolvedSenderUser ?? nextFallbackQrSenderUser;
                  const canReplyToMessage =
                    canQuoteMessageByDoubleClick(message);
                  const showSenderAvatar = shouldShowMessageSenderAvatar(
                    message,
                    senderAvatarUser,
                    nextMessage,
                    nextSenderAvatarUser,
                  );
                  const shouldUseStandaloneMediaBubble =
                    shouldUseStandaloneConversationMediaBubble(message);
                  const shouldOverlayStandaloneMediaMeta =
                    shouldOverlayStandaloneConversationMediaMeta(message);

                  return (
                    <div key={item.key}>
                      {shouldShowDateSeparator(
                        conversationTimelineItems,
                        index,
                      ) && (
                        <div className="my-3 flex items-center justify-center first:mt-0">
                          <span className="rounded-lg bg-[var(--surface-bubble-inbound)]/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                            {getDateLabel(item.timestamp)}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-end gap-2",
                          message.direction === "OUTBOUND"
                            ? "justify-end"
                            : message.direction === "SYSTEM"
                              ? "justify-center"
                              : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "relative mb-[2px] w-fit max-w-[88%] text-[13.5px] leading-[1.35] sm:max-w-[min(65%,32rem)]",
                            shouldUseStandaloneMediaBubble
                              ? "max-w-[calc(100%-2rem)] sm:max-w-[min(72%,26rem)]"
                              : "",
                            message.direction === "OUTBOUND"
                              ? "ml-auto"
                              : message.direction === "SYSTEM"
                                ? internalMessage
                                  ? "mx-auto max-w-[min(92%,36rem)] sm:max-w-[min(72%,36rem)]"
                                  : "mx-auto"
                                : "",
                          )}
                        >
                          <div
                            className={cn(
                              "relative rounded-lg px-2.5 py-1.5 shadow-sm",
                              shouldUseStandaloneMediaBubble
                                ? "rounded-[24px] bg-transparent px-0 py-0 shadow-none"
                                : "",
                              message.direction === "OUTBOUND"
                                ? shouldUseStandaloneMediaBubble
                                  ? "text-[var(--text-on-bubble)]"
                                  : "rounded-tr-[4px] bg-[var(--surface-bubble-outbound)] text-[var(--text-on-bubble)]"
                                : message.direction === "SYSTEM"
                                  ? internalMessage
                                    ? "rounded-2xl border border-[var(--surface-internal-note-border)] bg-[var(--surface-internal-note)] text-left text-foreground shadow-[0_10px_24px_rgba(30,70,130,0.08)]"
                                    : "rounded-lg border border-amber-500/20 bg-[var(--surface-bubble-inbound)]/80 text-center text-[12px] text-muted-foreground"
                                  : shouldUseStandaloneMediaBubble
                                    ? "text-[var(--text-on-bubble)]"
                                    : "rounded-tl-[4px] bg-[var(--surface-bubble-inbound)] text-[var(--text-on-bubble)]",
                            )}
                            onDoubleClick={(event) => {
                              if (shouldIgnoreMessageQuoteGesture(event.target)) {
                                return;
                              }

                              if (canReplyToMessage) {
                                setQuotedMessageId(message.id);
                                composerTextareaRef.current?.focus();
                              }
                            }}
                            onContextMenu={(event) =>
                              openMessageContextMenu(event, message)
                            }
                          >
                            <MessageBubbleContent
                              message={message}
                              activeVideoNoteId={activeVideoNoteId}
                              onActiveVideoNoteChange={setActiveVideoNoteId}
                            />
                            {shouldUseStandaloneMediaBubble ? (
                              shouldOverlayStandaloneMediaMeta ? (
                                <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center justify-end gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] leading-none text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] backdrop-blur-sm">
                                  {formatMessageTime(
                                    getConversationMessageTimestamp(message),
                                  )}
                                  {message.direction === "OUTBOUND" &&
                                  message.status !== "QUEUED" ? (
                                    <MessageStatusIcon status={message.status} />
                                  ) : null}
                                </span>
                              ) : null
                            ) : (
                              <span
                                className={cn(
                                  "mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none",
                                  message.direction === "OUTBOUND"
                                    ? "text-[var(--text-bubble-meta)]"
                                    : message.direction === "SYSTEM"
                                      ? internalMessage
                                        ? "text-[var(--text-internal-note-meta)]"
                                        : "text-muted-foreground/60"
                                      : "text-[var(--text-bubble-time)]",
                                )}
                              >
                                {formatMessageTime(
                                  getConversationMessageTimestamp(message),
                                )}
                                {message.direction === "OUTBOUND" &&
                                message.status !== "QUEUED" ? (
                                  <MessageStatusIcon status={message.status} />
                                ) : null}
                              </span>
                            )}
                          </div>
                        </div>
                        {showSenderAvatar ? (
                          <MessageSenderAvatar senderUser={senderAvatarUser} />
                        ) : message.direction === "OUTBOUND" && senderAvatarUser?.id ? (
                          <div className="h-6 w-6 shrink-0" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {!conversationMessagesQuery.isLoading &&
                selectedConversationMessages.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      icon={MessageSquareText}
                      title="Nenhuma mensagem nesta conversa"
                      description="Quando o historico for iniciado, as mensagens aparecerao aqui."
                    />
                  </div>
                ) : null}
              </div>

              <div className="safe-bottom-pad shrink-0 border-t border-border/40 bg-[var(--surface-chat-bg)] px-2.5 py-1.5 sm:px-3 sm:py-2">
                <div
                  className={cn(
                    "rounded-[18px] border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm sm:p-2.5",
                    isInternalComposerMode
                      ? "border-violet-400/20 bg-[var(--surface-chat-input-alt)]"
                      : "border-foreground/8 bg-[var(--surface-chat-input)]",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={(event) => {
                      setComposerMode("reply");
                      setSelectedFile(event.target.files?.[0] ?? null);
                    }}
                  />
                  {isRecording ? (
                    <div className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-bubble-inbound)] px-2.5 py-2">
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/85 transition hover:bg-white/6 hover:text-foreground"
                        onClick={() => finishRecording("discard")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-foreground/10 bg-foreground/[0.035] px-3.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <span
                          className={cn(
                            "h-3 w-3 shrink-0 rounded-full bg-[#ff4d5e] shadow-[0_0_20px_rgba(255,77,94,0.75)]",
                            recordingPaused ? "opacity-55" : "animate-pulse",
                          )}
                        />
                        <span className="w-10 shrink-0 font-semibold tabular-nums text-[12px] text-foreground/95">
                          {formatMediaDuration(recordingDuration)}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-[2px] overflow-hidden">
                          {AUDIO_WAVEFORM_BARS.map((barHeight, index) => (
                            <span
                              key={`recording-bar-${barHeight}-${index}`}
                              className={cn(
                                "shrink-0 rounded-full transition-all duration-200",
                                recordingPaused
                                  ? "bg-white/16 opacity-70"
                                  : "bg-white/72",
                              )}
                              style={{
                                height: `${Math.max(7, barHeight - 4)}px`,
                                width: index % 4 === 0 ? "5px" : "4px",
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/7 text-foreground transition hover:bg-white/12"
                        onClick={toggleRecordingPause}
                      >
                        {recordingPaused ? (
                          <Play className="ml-0.5 h-4 w-4 fill-current" />
                        ) : (
                          <Pause className="h-4 w-4 fill-current" />
                        )}
                      </button>

                      <button
                        type="button"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-foreground transition hover:bg-primary/85"
                        onClick={() => finishRecording("send")}
                        disabled={sendMediaMutation.isPending}
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  ) : selectedFile ? (
                    <div className="mb-2 flex items-center justify-between gap-2.5 rounded-xl border border-foreground/8 bg-foreground/[0.03] px-2.5 py-1.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        {selectedFile.type.startsWith("audio/") ? (
                          <Mic className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : (
                          <FileImage className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                        <span className="truncate">{selectedFile.name}</span>
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  {!isRecording ? (
                    <>
                      {isInternalComposerMode ? (
                        <div className="mb-2 flex items-start justify-between gap-3 rounded-[14px] border border-violet-400/20 bg-violet-500/10 px-3 py-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                              <StickyNote className="h-3.5 w-3.5" />
                              Mensagem interna
                            </p>
                            <p className="mt-1 text-xs leading-5 text-violet-100/75">
                              Ela aparece na timeline do chat, mas não é enviada
                              ao cliente.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full p-1 text-violet-100/70 transition hover:bg-violet-500/15 hover:text-violet-50"
                            onClick={() => setComposerMode("reply")}
                            aria-label="Sair do modo interno"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : quotedMessage ? (
                        <div className="mb-1.5 flex items-start justify-between gap-2 rounded-[12px] border-l-[3px] border-l-primary bg-[var(--surface-bubble-inbound)] px-2 py-1.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-primary">
                              Respondendo
                            </p>
                            <p className="truncate text-xs text-foreground/75">
                              {buildMessageQuotePreview(quotedMessage)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                            onClick={() => setQuotedMessageId(null)}
                            aria-label="Remover quote"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <Textarea
                        ref={composerTextareaRef}
                        value={messageDraft}
                        onChange={(event) =>
                          setMessageDraft(event.target.value)
                        }
                        onKeyDown={handleComposerKeyDown}
                        placeholder={
                          isInternalComposerMode
                            ? "Escreva uma anotação interna. Ela ficará visível apenas para os usuários do sistema."
                            : isConversationClosed
                              ? "Conversa encerrada para o cliente. Voce ainda pode registrar uma mensagem interna aqui."
                              : selectedFile
                                ? selectedFile.type.startsWith("audio/")
                                  ? "Adicione uma legenda opcional para a mensagem de voz..."
                                  : "Adicione uma legenda opcional para a mídia..."
                                : "Digite uma resposta para enviar pelo canal selecionado..."
                        }
                        className="min-h-[34px] max-h-28 resize-none border-none bg-transparent px-1 py-1 text-[13px] leading-5 placeholder:text-muted-foreground/50"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={
                              !activeConversationId ||
                              sendMediaMutation.isPending ||
                              isConversationClosed ||
                              isInternalComposerMode
                            }
                            className="h-8 rounded-[11px] px-2.5 text-[11px] font-medium sm:px-3 sm:text-xs"
                            title="Anexar arquivo"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Anexar
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setQuickMessagesOpen(true)}
                            disabled={
                              !activeConversationId ||
                              sendMutation.isPending ||
                              isInternalComposerMode
                            }
                            className="h-8 rounded-[11px] px-2.5 text-[11px] font-medium sm:px-3 sm:text-xs"
                            title="Abrir mensagens rapidas"
                          >
                            <MessageSquareText className="h-3.5 w-3.5" />
                            Rapidas
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              void startAudioRecording();
                            }}
                            disabled={
                              !activeConversationId ||
                              Boolean(selectedFile) ||
                              sendMediaMutation.isPending ||
                              isConversationClosed ||
                              isInternalComposerMode
                            }
                            className="h-8 rounded-[11px] px-2.5 text-[11px] font-medium sm:px-3 sm:text-xs"
                            title="Gravar audio"
                          >
                            <Mic className="h-3.5 w-3.5" />
                            Gravar áudio
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={toggleInternalComposerMode}
                            disabled={!canToggleInternalComposerMode}
                            className={cn(
                              "h-8 rounded-[11px] border px-2.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs",
                              isInternalComposerMode
                                ? "border-[var(--surface-internal-note-pill-border)] bg-[var(--surface-internal-note)] text-[var(--text-internal-note-accent)] hover:bg-[var(--surface-internal-note-pill)]"
                                : "border-[var(--surface-internal-note-pill-border)] bg-[var(--surface-internal-note-pill)] text-[var(--text-internal-note-accent)] hover:bg-[var(--surface-internal-note)]",
                            )}
                            title={
                              isInternalComposerMode
                                ? "Sair do modo de mensagem interna"
                                : "Ativar modo de mensagem interna no chat"
                            }
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                            {isInternalComposerMode
                              ? "Interna ativa"
                              : "Interna"}
                          </Button>
                        </div>
                        <div className="flex w-full sm:w-auto sm:justify-end">
                          <Button
                            onClick={submitComposer}
                            disabled={
                              isInternalComposerMode
                                ? !messageDraft.trim() ||
                                  !activeConversationId ||
                                  sendInternalMessageMutation.isPending
                                : (!messageDraft.trim() && !selectedFile) ||
                                  !activeConversationId ||
                                  sendMutation.isPending ||
                                  sendMediaMutation.isPending ||
                                  isConversationClosed
                            }
                            className={cn(
                              "h-8 w-full min-w-[140px] rounded-[11px] px-3 text-[11px] font-medium sm:w-auto sm:px-3.5 sm:text-xs",
                              isInternalComposerMode
                                ? "bg-violet-500/90 text-violet-50 hover:bg-violet-500"
                                : undefined,
                            )}
                          >
                            <SendHorizontal className="h-3.5 w-3.5" />
                            {isInternalComposerMode
                              ? "Salvar interna"
                              : selectedFile
                                ? "Enviar mídia"
                                : "Enviar"}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Inbox}
                title="Selecione uma conversa"
                description="Escolha uma conversa na lista lateral para abrir o historico e responder."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="hidden h-full min-h-0 overflow-hidden p-0 xl:block">
        {isDetailsPanelMinimized ? (
          <CardContent className="flex h-full min-h-0 flex-col items-center gap-4 p-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-11 w-11 rounded-2xl"
              onClick={() => setDetailsPanelCollapsed(false)}
              title="Expandir dados do contato"
              aria-label="Expandir dados do contato"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-primary/10 ring-1 ring-primary/20">
                <UserRound className="h-5 w-5 text-primary" />
              </div>
              <div className="w-full overflow-hidden text-center">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contato
                </p>
                <p className="truncate text-[10px] text-foreground/60">
                  {selectedConversation ? "Detalhes" : "Vazio"}
                </p>
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Painel lateral
                </p>
                <p className="text-sm font-medium text-foreground/88">
                  Dados do contato
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-2xl"
                onClick={() => setDetailsPanelCollapsed(true)}
                title="Minimizar dados do contato"
                aria-label="Minimizar dados do contato"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ConversationSidebar
              selectedConversation={selectedConversation}
              selectedTagIds={selectedTagIds}
              tags={tagsQuery.data ?? []}
              users={usersQuery.data ?? []}
              canTransferConversation={canTransferConversation}
              canResolveConversation={canResolveConversation}
              canCloseConversation={canCloseConversation}
              canReopenConversation={canReopenConversation}
              isConversationClosed={isConversationClosed}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              onAddNote={() => noteMutation.mutate()}
              onResolve={() => resolveConversationMutation.mutate()}
              onClose={() => closeConversationMutation.mutate()}
              onReopen={() => reopenConversationMutation.mutate()}
              onUpdateConversation={(payload) =>
                updateConversationMutation.mutate(payload)
              }
              reminderForm={reminderForm}
              onReminderFormChange={setReminderForm}
              editingReminderId={editingReminderId}
              onEditReminder={startReminderEdit}
              onClearReminderEditor={clearReminderEditor}
              onSaveReminder={() => saveReminderMutation.mutateAsync()}
              onCompleteReminder={(reminderId) =>
                completeReminderMutation.mutate(reminderId)
              }
              onCancelReminder={(reminderId) =>
                cancelReminderMutation.mutate(reminderId)
              }
              remindersBusy={
                saveReminderMutation.isPending ||
                completeReminderMutation.isPending ||
                cancelReminderMutation.isPending
              }
            />
          </CardContent>
        )}
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-full p-0 xl:hidden sm:w-[min(94vw,680px)]">
          <div className="max-h-[92vh] overflow-y-auto">
            <ConversationSidebar
              selectedConversation={selectedConversation}
              selectedTagIds={selectedTagIds}
              tags={tagsQuery.data ?? []}
              users={usersQuery.data ?? []}
              canTransferConversation={canTransferConversation}
              canResolveConversation={canResolveConversation}
              canCloseConversation={canCloseConversation}
              canReopenConversation={canReopenConversation}
              isConversationClosed={isConversationClosed}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              onAddNote={() => noteMutation.mutate()}
              onResolve={() => resolveConversationMutation.mutate()}
              onClose={() => closeConversationMutation.mutate()}
              onReopen={() => reopenConversationMutation.mutate()}
              onUpdateConversation={(payload) =>
                updateConversationMutation.mutate(payload)
              }
              reminderForm={reminderForm}
              onReminderFormChange={setReminderForm}
              editingReminderId={editingReminderId}
              onEditReminder={startReminderEdit}
              onClearReminderEditor={clearReminderEditor}
              onSaveReminder={() => saveReminderMutation.mutateAsync()}
              onCompleteReminder={(reminderId) =>
                completeReminderMutation.mutate(reminderId)
              }
              onCancelReminder={(reminderId) =>
                cancelReminderMutation.mutate(reminderId)
              }
              remindersBusy={
                saveReminderMutation.isPending ||
                completeReminderMutation.isPending ||
                cancelReminderMutation.isPending
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <QuickMessagesDialog
        open={quickMessagesOpen}
        onOpenChange={setQuickMessagesOpen}
        conversationId={activeConversationId}
        canManage={canManageQuickMessages}
        isConversationClosed={isConversationClosed}
        onInsertInInput={(value) => {
          setComposerMode("reply");
          setMessageDraft(value);
          window.requestAnimationFrame(() => {
            composerTextareaRef.current?.focus();
          });
        }}
        onMessageSent={refreshConversationQueries}
      />

      {messageContextMenu ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeMessageContextMenu}
            onContextMenu={(event) => {
              event.preventDefault();
              closeMessageContextMenu();
            }}
          />
          <div
            className="fixed z-50 w-[180px] overflow-hidden rounded-2xl border border-foreground/10 bg-[var(--surface-context-menu)]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            style={{
              left: messageContextMenu.x,
              top: messageContextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground/92 transition hover:bg-foreground/10"
              onClick={() => void handleCopyMessage(messageContextMenu.message)}
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            {canQuoteMessage(messageContextMenu.message) ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground/92 transition hover:bg-foreground/10"
                onClick={() => handleReplyToMessage(messageContextMenu.message)}
              >
                <Reply className="h-4 w-4" />
                Responder
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxPageContent />
    </Suspense>
  );
}

export function InboxPageSkeleton() {
  return (
    <div className="grid h-full gap-3 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_340px]">
      <div className="rounded-[26px] border border-border bg-background-elevated/45 p-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-8 w-5/6 rounded-xl" />
          <Skeleton className="h-8 w-4/5 rounded-xl" />
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="rounded-[26px] border border-border bg-background-elevated/45 p-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-52 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-18 w-3/4 rounded-2xl" />
          <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl" />
          <Skeleton className="h-16 w-1/2 rounded-2xl" />
          <Skeleton className="ml-auto h-22 w-3/5 rounded-2xl" />
          <Skeleton className="h-18 w-2/3 rounded-2xl" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </div>

      <div className="hidden rounded-[26px] border border-border bg-background-elevated/45 p-4 xl:block">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function ChatConversationLoadingState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-heading text-[18px] font-semibold">
              Carregando conversa...
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buscando histórico e informações do contato.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Carregando
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 py-3.5 sm:px-5">
        <Skeleton className="h-18 w-[72%] rounded-[20px]" />
        <Skeleton className="ml-auto h-16 w-[58%] rounded-[20px]" />
        <Skeleton className="h-20 w-[66%] rounded-[20px]" />
        <Skeleton className="ml-auto h-14 w-[44%] rounded-[20px]" />
        <Skeleton className="h-16 w-[54%] rounded-[20px]" />
      </div>

      <div className="safe-bottom-pad shrink-0 border-t border-border p-3.5 sm:p-4">
        <div className="rounded-[16px] border border-foreground/8 bg-background-elevated p-3">
          <p className="text-xs text-muted-foreground">
            Preparando o chat para envio de mensagens...
          </p>
        </div>
      </div>
    </div>
  );
}

function ConversationSidebar({
  selectedConversation,
  selectedTagIds,
  tags,
  users,
  canTransferConversation,
  canResolveConversation,
  canCloseConversation,
  canReopenConversation,
  isConversationClosed,
  noteDraft,
  onNoteDraftChange,
  onAddNote,
  onResolve,
  onClose,
  onReopen,
  onUpdateConversation,
  reminderForm,
  onReminderFormChange,
  editingReminderId,
  onEditReminder,
  onClearReminderEditor,
  onSaveReminder,
  onCompleteReminder,
  onCancelReminder,
  remindersBusy,
}: {
  selectedConversation?: Conversation;
  selectedTagIds: string[];
  tags: Tag[];
  users: UserSummary[];
  canTransferConversation: boolean;
  canResolveConversation: boolean;
  canCloseConversation: boolean;
  canReopenConversation: boolean;
  isConversationClosed: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onAddNote: () => void;
  onResolve: () => void;
  onClose: () => void;
  onReopen: () => void;
  onUpdateConversation: (payload: {
    assignedUserId?: string;
    tagIds?: string[];
  }) => void;
  reminderForm: ReminderFormState;
  onReminderFormChange: (
    value:
      | ReminderFormState
      | ((current: ReminderFormState) => ReminderFormState),
  ) => void;
  editingReminderId: string | null;
  onEditReminder: (reminder: ConversationReminder) => void;
  onClearReminderEditor: () => void;
  onSaveReminder: () => Promise<unknown>;
  onCompleteReminder: (reminderId: string) => void;
  onCancelReminder: (reminderId: string) => void;
  remindersBusy: boolean;
}) {
  if (!selectedConversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Inbox}
          title="Sem detalhes"
          description="Selecione uma conversa para exibir dados do contato, tags, lembretes e notas internas."
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        <div>
          <div className="flex items-start gap-3.5">
            {shouldShowConversationContactAvatar(selectedConversation) ? (
              <ConversationContactAvatar
                conversation={selectedConversation}
                className="h-16 w-16 rounded-[22px]"
                fallbackClassName="rounded-[22px] text-base"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Contato</p>
              <h3 className="mt-1 font-heading text-[22px] font-semibold">
                {selectedConversation.contact.name}
              </h3>
              {getConversationDisplayPhone(selectedConversation) ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {getConversationDisplayPhone(selectedConversation)}
                </p>
              ) : isQrConversation(selectedConversation) ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Numero sincronizando
                </p>
              ) : null}
              {getConversationInstanceLabel(selectedConversation) ? (
                <p className="text-sm text-muted-foreground">
                  Instância: {getConversationInstanceLabel(selectedConversation)}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {selectedConversation.contact.email ?? "Sem email cadastrado"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-[20px] border border-border bg-foreground/[0.03] p-3.5">
          <p className="font-medium">Atribuição e status</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={selectedConversation.status}
              closeReason={selectedConversation.closeReason}
            />
            {selectedConversation.status === "WAITING" ? (
              <Badge variant="secondary">Disponível para retomada</Badge>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="secondary"
              disabled={!canResolveConversation || isConversationClosed}
              onClick={onResolve}
            >
              Resolver
            </Button>
            <Button
              variant="secondary"
              disabled={!canCloseConversation || isConversationClosed}
              onClick={onClose}
            >
              Encerrar
            </Button>
            <Button
              variant="ghost"
              disabled={!canReopenConversation || !isConversationClosed}
              onClick={onReopen}
            >
              Reabrir
            </Button>
          </div>
          <NativeSelect
            className="h-10 rounded-xl px-3.5 text-sm"
            value={selectedConversation.assignedUser?.id ?? ""}
            onChange={(event) =>
              onUpdateConversation({
                assignedUserId: event.target.value || undefined,
              })
            }
            disabled={!canTransferConversation || isConversationClosed}
          >
            <option value="">Sem responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </NativeSelect>
          {!canTransferConversation ? (
            <p className="text-xs text-muted-foreground">
              Transferência de conversa não liberada para seu usuário.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-[20px] border border-border bg-foreground/[0.03] p-3.5">
          <p className="font-medium">Tags da conversa</p>
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);

                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-transparent bg-primary text-foreground shadow-[0_10px_24px_rgba(50,151,255,0.24)]"
                        : "border-foreground/10 bg-foreground/[0.03] text-foreground/76 hover:border-primary/30 hover:text-foreground",
                    )}
                    onClick={() =>
                      onUpdateConversation({
                        tagIds: active
                          ? selectedTagIds.filter((tagId) => tagId !== tag.id)
                          : [...selectedTagIds, tag.id],
                      })
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/10 bg-foreground/[0.02] px-3 py-4 text-sm text-muted-foreground">
              Nenhuma tag cadastrada ainda.
            </div>
          )}
        </div>

        <ConversationRemindersPanel
          reminders={selectedConversation.reminders ?? []}
          reminderForm={reminderForm}
          onReminderFormChange={onReminderFormChange}
          editingReminderId={editingReminderId}
          onEditReminder={onEditReminder}
          onClearReminderEditor={onClearReminderEditor}
          onSaveReminder={onSaveReminder}
          onCompleteReminder={onCompleteReminder}
          onCancelReminder={onCancelReminder}
          remindersBusy={remindersBusy}
        />

        <div className="space-y-3 rounded-[20px] border border-border bg-foreground/[0.03] p-3.5">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            <p className="font-medium">Notas internas</p>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(event.target.value)}
            placeholder="Registre um contexto interno para o time..."
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={onAddNote}
            disabled={!noteDraft.trim()}
          >
            Adicionar nota
          </Button>
          <div className="space-y-3">
            {selectedConversation.notes?.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-border bg-background-panel p-3"
              >
                <p className="text-sm">{note.content}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {note.author.name} • {formatDate(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubbleContent({
  message,
  activeVideoNoteId,
  onActiveVideoNoteChange,
}: {
  message: ConversationMessage;
  activeVideoNoteId: string | null;
  onActiveVideoNoteChange: (messageId: string | null) => void;
}) {
  const mediaUrl = `/api/proxy/messages/${message.id}/media`;
  const messageCaption = getMessageCaption(message);
  const normalizedMessageType = normalizeConversationMessageType(
    message.messageType,
  );
  const mediaMetadata = resolveMessageMediaMetadata(message.metadata);
  const internalMessage = resolveInternalMessageMetadata(message.metadata);
  const tone =
    message.direction === "OUTBOUND"
      ? "outgoing"
      : message.direction === "SYSTEM"
        ? "system"
        : "incoming";
  const quote = hasRenderableConversationQuote(message.metadata?.quote)
    ? message.metadata?.quote
    : null;
  const quoteBlock = quote ? (
    <QuotedMessageBlock quote={quote} tone={tone} />
  ) : null;
  const isPdfDocument = isPdfConversationMedia(mediaMetadata);
  const hasUnknownMedia =
    mediaMetadata.hasAttachment &&
    ![
      "image",
      "sticker",
      "audio",
      "video",
      "document",
      "template",
      "text",
    ].includes(normalizedMessageType);

  // Detect media type from mimeType when messageType is unknown/unsupported
  const effectiveType = (() => {
    if (!hasUnknownMedia) return normalizedMessageType;
    const mime = mediaMetadata.mimeType ?? "";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return normalizedMessageType;
  })();

  if (internalMessage) {
    return (
      <InternalConversationMessageContent
        content={message.content}
        internalMessage={internalMessage}
      />
    );
  }

  if (effectiveType === "image" || effectiveType === "sticker") {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <ImageMessagePreview
          src={mediaUrl}
          alt={effectiveType === "sticker" ? "Figurinha" : "Imagem"}
          isSticker={effectiveType === "sticker"}
        />
        {messageCaption ? (
          <FormattedMessageText content={messageCaption} tone={tone} />
        ) : null}
      </div>
    );
  }

  if (effectiveType === "audio") {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <CompactAudioPlayer
          key={mediaUrl}
          src={mediaUrl}
          isVoiceMessage={Boolean(message.metadata?.voice)}
          outgoing={message.direction === "OUTBOUND"}
        />
        {messageCaption ? (
          <FormattedMessageText content={messageCaption} tone={tone} />
        ) : null}
      </div>
    );
  }

  if (effectiveType === "video") {
    const isVideoNote = isVideoNoteConversationMessageType(message.messageType);

    return (
      <div className="space-y-2">
        {quoteBlock}
        {isVideoNote ? (
          <VideoNoteMessagePlayer
            messageId={message.id}
            src={mediaUrl}
            isExpanded={activeVideoNoteId === message.id}
            onActiveChange={onActiveVideoNoteChange}
          />
        ) : (
          <VideoMessagePlayer
            src={mediaUrl}
            timestampLabel={formatMessageTime(
              getConversationMessageTimestamp(message),
            )}
            status={message.status}
            outgoing={message.direction === "OUTBOUND"}
          />
        )}
        {messageCaption ? (
          <FormattedMessageText content={messageCaption} tone={tone} />
        ) : null}
      </div>
    );
  }

  if (effectiveType === "document" || hasUnknownMedia) {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <DocumentMessagePreview
          src={mediaUrl}
          fileName={
            mediaMetadata.fileName ??
            (hasUnknownMedia ? "Midia anexada" : "Documento")
          }
          isPdf={isPdfDocument}
        />
        {messageCaption ? (
          <FormattedMessageText content={messageCaption} tone={tone} />
        ) : null}
      </div>
    );
  }

  if (effectiveType === "template") {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <div className="inline-flex rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium opacity-75">
          {message.metadata?.windowClosedTemplateReply
            ? `Template automatico: ${message.metadata?.templateName ?? "aprovado"}`
            : `Template: ${message.metadata?.templateName ?? "aprovado"}`}
        </div>
        <FormattedMessageText content={message.content} tone={tone} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quoteBlock}
      <FormattedMessageText content={message.content} tone={tone} />
    </div>
  );
}

function InternalConversationMessageContent({
  content,
  internalMessage,
}: {
  content?: string | null;
  internalMessage: NonNullable<
    NonNullable<ConversationMessage["metadata"]>["internalMessage"]
  >;
}) {
  const label = internalMessage.label?.trim() || "Mensagem interna";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-internal-note-pill-border)] bg-[var(--surface-internal-note-pill)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-internal-note-accent)]">
          <StickyNote className="h-3 w-3" />
          {label}
        </span>
      </div>
      {internalMessage.authorName ? (
        <p className="text-[11px] text-[var(--text-internal-note-meta)]">
          Registrada por {internalMessage.authorName}
        </p>
      ) : null}
      <FormattedMessageText content={content} tone="system" />
    </div>
  );
}

function DocumentMessagePreview({
  src,
  fileName,
  isPdf,
}: {
  src: string;
  fileName: string;
  isPdf: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isPdf) {
    return (
      <>
        <div className="flex w-full max-w-[340px] flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/72">
              PDF
            </p>
            <p className="truncate text-sm text-foreground/92">{fileName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 rounded-[11px] border-foreground/10 bg-foreground/10 px-3 text-xs text-foreground hover:bg-foreground/15"
              onClick={() => setOpen(true)}
            >
              <Expand className="mr-1.5 h-3.5 w-3.5" />
              Visualizar
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-8 rounded-[11px] border-foreground/10 bg-foreground/10 px-3 text-xs text-foreground hover:bg-foreground/15"
            >
              <a href={src} download>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Baixar
              </a>
            </Button>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,1100px)] max-w-none flex-col overflow-hidden rounded-[24px] border border-foreground/10 bg-background/95 p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3 text-foreground">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Visualizacao do PDF</p>
                <p className="truncate text-xs text-foreground/60">{fileName}</p>
              </div>
              <Button
                asChild
                variant="secondary"
                className="rounded-xl border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/15"
              >
                <a href={src} download>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </a>
              </Button>
            </div>
            <div className="min-h-0 flex-1 bg-[var(--surface-message-area)] p-3">
              <iframe
                src={src}
                title={fileName}
                className="h-full w-full rounded-[18px] border border-foreground/10 bg-white"
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/72">
          Documento
        </p>
        <p className="truncate text-sm text-foreground/92">{fileName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          variant="secondary"
          className="h-8 rounded-[11px] border-foreground/10 bg-foreground/10 px-3 text-xs text-foreground hover:bg-foreground/15"
        >
          <a href={src} target="_blank" rel="noreferrer">
            <Expand className="mr-1.5 h-3.5 w-3.5" />
            Abrir
          </a>
        </Button>
        <Button
          asChild
          variant="secondary"
          className="h-8 rounded-[11px] border-foreground/10 bg-foreground/10 px-3 text-xs text-foreground hover:bg-foreground/15"
        >
          <a href={src} download>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Baixar
          </a>
        </Button>
      </div>
    </div>
  );
}

function QuotedMessageBlock({
  quote,
  tone,
}: {
  quote: NonNullable<NonNullable<ConversationMessage["metadata"]>["quote"]>;
  tone: "outgoing" | "incoming" | "system";
}) {
  const sourceLabel =
    quote.direction === "OUTBOUND"
      ? "Mensagem do atendimento"
      : quote.direction === "SYSTEM"
        ? "Mensagem do sistema"
        : "Mensagem do cliente";

  return (
    <div
      className={cn(
        "rounded-md border-l-[3px] px-2 py-1.5",
        tone === "outgoing"
          ? "border-l-[var(--text-link-blue)] bg-[var(--surface-quote-bg)]/60"
          : tone === "system"
            ? "border-l-primary/50 bg-primary/10"
            : "border-l-[var(--text-link-blue)] bg-foreground/[0.06]",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold",
          tone === "outgoing" ? "text-[var(--text-link-blue)]" : "text-[var(--text-link-blue)]",
        )}
      >
        {sourceLabel}
      </p>
      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-4 opacity-75">
        {quote.contentPreview?.trim() || "Mensagem citada"}
      </p>
    </div>
  );
}

function hasRenderableConversationQuote(
  quote?: NonNullable<ConversationMessage["metadata"]>["quote"] | null,
) {
  if (!quote) {
    return false;
  }

  return Boolean(
    quote.messageId?.trim() ||
      quote.externalMessageId?.trim() ||
      quote.contentPreview?.trim() ||
      quote.messageType?.trim() ||
      quote.direction?.trim() ||
      quote.createdAt?.trim() ||
      quote.from?.trim(),
  );
}

function FormattedMessageText({
  content,
  tone,
}: {
  content?: string | null;
  tone: "outgoing" | "incoming" | "system";
}) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <WhatsAppFormattedText
      content={content}
      tone={tone === "outgoing" ? "outgoing" : "incoming"}
      className="text-[13px] leading-5"
    />
  );
}

function MessageStatusIcon({ status }: { status?: string | null }) {
  if (status === "READ") {
    return <CheckCheck className="h-[14px] w-[14px] text-[var(--text-link-accent)]" />;
  }
  if (status === "DELIVERED") {
    return <CheckCheck className="h-[14px] w-[14px]" />;
  }
  if (status === "SENT") {
    return <Check className="h-[14px] w-[14px]" />;
  }
  if (status === "FAILED") {
    return <span className="text-[10px] text-red-400">!</span>;
  }
  return null;
}

function StatusBadge({
  status,
  closeReason,
}: {
  status: string;
  closeReason?: Conversation["closeReason"];
}) {
  const badgeClassName =
    status === "NEW" || status === "OPEN"
      ? "border-transparent bg-primary/20 text-[var(--text-link-blue)]"
      : status === "IN_PROGRESS" || status === "PENDING"
        ? "border-transparent bg-primary/20 text-primary"
        : status === "WAITING"
          ? "border-transparent bg-amber-500/15 text-amber-300"
          : status === "RESOLVED"
            ? "border-transparent bg-emerald-500/15 text-emerald-300"
            : "border-transparent bg-rose-500/15 text-rose-300";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        badgeClassName,
      )}
    >
      {getConversationStatusLabel(status, closeReason)}
    </span>
  );
}

function ConversationTimelineEvent({
  label,
  timestamp,
  tone = "info",
}: {
  label: string;
  timestamp: string;
  tone?: "info" | "warning" | "danger";
}) {
  const toneClassName =
    tone === "danger"
      ? "border-[var(--timeline-event-danger-border)] bg-[var(--timeline-event-danger-bg)]"
      : tone === "warning"
        ? "border-[var(--timeline-event-warning-border)] bg-[var(--timeline-event-warning-bg)]"
        : "border-[var(--timeline-event-info-border)] bg-[var(--timeline-event-info-bg)]";
  const labelClassName =
    tone === "danger"
      ? "text-[var(--timeline-event-danger-text)]"
      : tone === "warning"
        ? "text-[var(--timeline-event-warning-text)]"
        : "text-[var(--timeline-event-info-text)]";
  const timestampClassName =
    tone === "danger"
      ? "text-[11px] font-medium text-[var(--timeline-event-danger-meta)]"
      : tone === "warning"
        ? "text-[11px] font-medium text-[var(--timeline-event-warning-meta)]"
        : "text-[11px] text-[var(--timeline-event-info-meta)]";

  return (
    <div className="my-3 flex items-center justify-center first:mt-0">
      <div
        className={cn(
          "inline-flex max-w-full flex-col items-center gap-1 rounded-2xl border px-4 py-2 text-center shadow-sm backdrop-blur-sm",
          toneClassName,
        )}
      >
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.16em]",
            labelClassName,
          )}
        >
          {label}
        </span>
        <span className={timestampClassName}>{formatDate(timestamp)}</span>
      </div>
    </div>
  );
}

function MessageBubbleSkeleton({ align }: { align: "start" | "end" }) {
  return (
    <div
      className={cn("flex", align === "end" ? "justify-end" : "justify-start")}
    >
      <div className="w-full max-w-[min(65%,32rem)] space-y-2 rounded-2xl bg-[var(--surface-bubble-inbound)]/50 px-3 py-2 shadow-sm">
        <Skeleton className="h-4 w-24 bg-foreground/10" />
        <Skeleton className="h-4 w-40 bg-foreground/10" />
        <Skeleton className="ml-auto h-3 w-12 bg-foreground/10" />
      </div>
    </div>
  );
}

function MediaLoadingSkeleton({
  width,
  height,
  rounded = "rounded-md",
}: {
  width: string;
  height: string;
  rounded?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center bg-foreground/[0.06]",
        rounded,
        width,
        height,
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary/70" />
          <div className="h-2 w-2 rounded-full bg-primary/40" />
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          Carregando...
        </span>
      </div>
    </div>
  );
}

function useDeferredMediaLoad(rootMargin = "240px") {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (shouldLoad) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
      },
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, [rootMargin, shouldLoad]);

  return {
    containerRef,
    shouldLoad,
    forceLoad: () => setShouldLoad(true),
  };
}

function ImageMessagePreview({
  src,
  alt,
  isSticker,
}: {
  src: string;
  alt: string;
  isSticker: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [previewImageSize, setPreviewImageSize] = useState({
    width: 0,
    height: 0,
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [baseImageSize, setBaseImageSize] = useState({ width: 0, height: 0 });
  const dialogViewportRef = useRef<HTMLDivElement | null>(null);
  const dialogImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const { containerRef, shouldLoad, forceLoad } = useDeferredMediaLoad(
    isSticker ? "120px" : "260px",
  );
  const shouldRenderImage = shouldLoad || open;
  const constrainedPreviewSize = useMemo(
    () =>
      previewImageSize.width && previewImageSize.height
        ? getConstrainedMediaDimensions(previewImageSize, {
            maxWidth: 320,
            maxHeight: 420,
          })
        : null,
    [previewImageSize],
  );
  const previewAspectRatio =
    previewImageSize.width && previewImageSize.height
      ? previewImageSize.width / previewImageSize.height
      : 4 / 3;
  const previewWidth = constrainedPreviewSize?.width ?? 300;

  const clampPan = useCallback(
    (nextPan: { x: number; y: number }, nextZoom = zoom) => {
      const viewport = dialogViewportRef.current;
      const baseWidth =
        dialogImageRef.current?.clientWidth || baseImageSize.width;
      const baseHeight =
        dialogImageRef.current?.clientHeight || baseImageSize.height;

      if (!viewport || !baseWidth || !baseHeight || nextZoom <= 1) {
        return { x: 0, y: 0 };
      }

      const overflowX = Math.max(
        0,
        baseWidth * nextZoom - viewport.clientWidth,
      );
      const overflowY = Math.max(
        0,
        baseHeight * nextZoom - viewport.clientHeight,
      );

      return {
        x: Math.min(overflowX / 2, Math.max(-overflowX / 2, nextPan.x)),
        y: Math.min(overflowY / 2, Math.max(-overflowY / 2, nextPan.y)),
      };
    },
    [baseImageSize.height, baseImageSize.width, zoom],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      forceLoad();
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
      dragStateRef.current = null;
    }

    setOpen(nextOpen);
  };

  const adjustZoom = (delta: number) => {
    setZoom((current) => {
      const nextZoom = Math.min(
        4,
        Math.max(1, Number((current + delta).toFixed(2))),
      );
      setPan((currentPan) => clampPan(currentPan, nextZoom));
      return nextZoom;
    });
  };

  const handleDialogImageLoad = () => {
    const image = dialogImageRef.current;

    if (!image) {
      return;
    }

    setBaseImageSize({
      width: image.clientWidth,
      height: image.clientHeight,
    });
    setPan((currentPan) => clampPan(currentPan, zoom));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    setPan(
      clampPan({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      }),
    );
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  };

  if (isSticker) {
    return (
      <div
        ref={containerRef}
        className="relative h-32 w-32 overflow-hidden rounded-2xl sm:h-36 sm:w-36"
      >
        {!isLoaded && !hasError && (
          <MediaLoadingSkeleton
            width="w-32 sm:w-36"
            height="h-32 sm:h-36"
            rounded="rounded-2xl"
          />
        )}
        {shouldRenderImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setHasError(true);
              setIsLoaded(true);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="max-w-full"
        data-prevent-message-quote="true"
      >
        <button
          type="button"
          className="relative inline-block max-w-full overflow-hidden rounded-[22px] bg-black/10 align-top shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
          onClick={() => handleOpenChange(true)}
          style={{
            aspectRatio: `${previewAspectRatio}`,
            width: `min(${previewWidth}px, calc(100vw - 7rem))`,
          }}
        >
          {!isLoaded && !hasError && (
            <MediaLoadingSkeleton
              width="w-full"
              height="h-full"
              rounded="rounded-xl"
            />
          )}
          {shouldRenderImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
                isLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={(event) => {
                setPreviewImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                setIsLoaded(true);
              }}
              onError={() => {
                setHasError(true);
                setIsLoaded(true);
              }}
            />
          ) : null}
          {hasError ? (
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/60 px-4 text-center text-xs text-foreground/70">
              Nao foi possivel carregar a imagem.
            </span>
          ) : null}
        </button>
      </div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,1100px)] max-w-none flex-col overflow-hidden rounded-[24px] border border-foreground/10 bg-background/95 p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3 text-foreground">
            <div>
              <p className="text-sm font-semibold">Visualizacao da imagem</p>
              <p className="text-xs text-foreground/60">
                Use zoom, arraste a imagem ampliada e baixe a midia quando
                precisar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/15"
                onClick={() => adjustZoom(-0.25)}
                disabled={zoom <= 1}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/15"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setIsDragging(false);
                  dragStateRef.current = null;
                }}
                disabled={zoom === 1}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/15"
                onClick={() => adjustZoom(0.25)}
                disabled={zoom >= 4}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                asChild
                variant="secondary"
                className="rounded-xl border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/15"
              >
                <a href={src} download>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </a>
              </Button>
            </div>
          </div>

          <div
            ref={dialogViewportRef}
            className={cn(
              "min-h-0 flex-1 overflow-hidden p-4",
              zoom > 1
                ? isDragging
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-default",
            )}
            onWheel={(event) => {
              if (!event.ctrlKey) {
                return;
              }

              event.preventDefault();
              adjustZoom(event.deltaY > 0 ? -0.2 : 0.2);
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
            onPointerLeave={(event) => {
              if (!dragStateRef.current) {
                return;
              }

              finishPointerDrag(event);
            }}
            style={{
              touchAction: zoom > 1 ? "none" : "auto",
            }}
          >
            <div className="flex min-h-full min-w-full items-center justify-center">
              {shouldRenderImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  ref={dialogImageRef}
                  src={src}
                  alt={alt}
                  onLoad={handleDialogImageLoad}
                  className="max-h-[calc(100dvh-11rem)] max-w-[min(100%,900px)] select-none rounded-[18px] object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-transform duration-200"
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              ) : (
                <MediaLoadingSkeleton
                  width="w-[320px]"
                  height="h-[240px]"
                  rounded="rounded-[18px]"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoMessagePlayer({
  src,
  timestampLabel,
  status,
  outgoing,
}: {
  src: string;
  timestampLabel: string;
  status?: string | null;
  outgoing: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const {
    containerRef: visibilityRef,
    shouldLoad,
    forceLoad,
  } = useDeferredMediaLoad("260px");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewVideoSize, setPreviewVideoSize] = useState({
    width: 0,
    height: 0,
  });
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const constrainedPreviewSize = useMemo(
    () =>
      previewVideoSize.width && previewVideoSize.height
        ? getConstrainedMediaDimensions(previewVideoSize, {
            maxWidth: 340,
            maxHeight: 460,
          })
        : null,
    [previewVideoSize],
  );
  const previewAspectRatio =
    previewVideoSize.width && previewVideoSize.height
      ? previewVideoSize.width / previewVideoSize.height
      : 16 / 9;
  const previewWidth = constrainedPreviewSize?.width ?? 320;

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setPreviewVideoSize({
        width: video.videoWidth,
        height: video.videoHeight,
      });
      setIsLoading(false);
    };
    const handleCanPlay = () => setIsLoading(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress(
        video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0,
      );
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      video.currentTime = 0;
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      video.pause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };
  }, [shouldLoad, src]);

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
  };

  const togglePlayback = async () => {
    if (!shouldLoad) {
      forceLoad();
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        toast.error("Nao foi possivel reproduzir o video.");
      }
    } else {
      video.pause();
    }
    showControlsTemporarily();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    showControlsTemporarily();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const newTime = Number(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    showControlsTemporarily();
  };

  const enterFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // fullscreen not supported, open in dialog instead
      const video = videoRef.current;
      if (video) window.open(src, "_blank");
    }
    showControlsTemporarily();
  };

  return (
    <div
      ref={visibilityRef}
      className={cn(isFullscreen ? "h-full w-full" : "max-w-full")}
      data-prevent-message-quote="true"
    >
      <div
        ref={containerRef}
        className={cn(
          "group relative overflow-hidden rounded-[24px] bg-black shadow-[0_18px_34px_rgba(15,23,42,0.18)]",
          isFullscreen ? "h-full w-full" : "inline-block max-w-full align-top",
        )}
        style={
          isFullscreen
            ? undefined
            : {
                aspectRatio: `${previewAspectRatio}`,
                width: `min(${previewWidth}px, calc(100vw - 7rem))`,
              }
        }
        onMouseMove={showControlsTemporarily}
        onTouchStart={showControlsTemporarily}
        onClick={() => {
          forceLoad();
          void togglePlayback();
        }}
      >
        <video
          ref={videoRef}
          src={shouldLoad ? src : undefined}
          playsInline
          preload={shouldLoad ? "metadata" : "none"}
          className={cn(
            "h-full w-full object-contain",
            isLoading || !shouldLoad ? "opacity-0" : "opacity-100",
          )}
        />

        {/* Loading state */}
        {(isLoading || !shouldLoad) && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/28">
            <MediaLoadingSkeleton
              width="w-full"
              height="h-full"
              rounded="rounded-xl"
            />
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
            <span className="text-[12px] text-white/78">
              Erro ao carregar video
            </span>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir no navegador
            </a>
          </div>
        )}

        {/* Play button overlay (centered, shown when paused or no controls) */}
        {!isLoading && !hasError && shouldLoad && !isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              void togglePlayback();
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/16 bg-black/34 text-white shadow-[0_16px_32px_rgba(15,23,42,0.22)] backdrop-blur-sm transition hover:bg-black/48 sm:h-14 sm:w-14">
              <Play className="ml-1 h-5 w-5 fill-current sm:h-6 sm:w-6" />
            </div>
          </div>
        )}

        {!isLoading && !hasError && shouldLoad && !isFullscreen ? (
          <div className="pointer-events-none absolute bottom-[3.35rem] right-3 z-10 inline-flex items-center justify-end gap-1 rounded-full border border-white/14 bg-black/52 px-2.5 py-1 text-[10px] leading-none text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] backdrop-blur-md">
            <span>{timestampLabel}</span>
            {outgoing && status !== "QUEUED" ? (
              <MessageStatusIcon status={status} />
            ) : null}
          </div>
        ) : null}

        {/* Controls overlay */}
        {!isLoading && !hasError && shouldLoad && (
          <div
            className={cn(
              "absolute inset-x-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/82 via-black/24 to-transparent transition-opacity duration-200",
              isFullscreen
                ? "bottom-0 p-3"
                : "bottom-0 px-3 pb-3 pt-4",
              showControls || !isPlaying ? "opacity-100" : "opacity-0",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Seekbar */}
            <div className="relative h-1.5 w-full">
              <div className="absolute inset-0 rounded-full bg-white/24" />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            {/* Buttons row */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/92 transition hover:bg-white/10"
                onClick={togglePlayback}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                )}
              </button>
              <span className="flex-1 text-[10px] tabular-nums text-white/82">
                {formatMediaDuration(currentTime)} /{" "}
                {formatMediaDuration(duration)}
              </span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/92 transition hover:bg-white/10"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/92 transition hover:bg-white/10"
                onClick={enterFullscreen}
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                <Expand className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoNoteMessagePlayer({
  messageId,
  src,
  isExpanded,
  onActiveChange,
}: {
  messageId: string;
  src: string;
  isExpanded: boolean;
  onActiveChange: (messageId: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isExpandedRef = useRef(isExpanded);
  const { containerRef, shouldLoad, forceLoad } = useDeferredMediaLoad("220px");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const shouldAutoPlayRef = useRef(false);

  useLayoutEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setIsLoading(false);
    };
    const handleCanPlay = () => {
      setIsLoading(false);

      if (!shouldAutoPlayRef.current) {
        return;
      }

      shouldAutoPlayRef.current = false;
      void video.play().catch(() => {
        onActiveChange(null);
        toast.error("Nao foi possivel reproduzir o video.");
      });
    };
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      video.currentTime = 0;
      onActiveChange(null);
    };
    const handlePlay = () => {
      setIsPlaying(true);
      onActiveChange(messageId);
    };
    const handlePause = () => {
      setIsPlaying(false);

      if (
        !isExpandedRef.current ||
        video.ended ||
        video.currentTime === 0 ||
        document.hidden
      ) {
        return;
      }

      onActiveChange(null);
    };
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      shouldAutoPlayRef.current = false;
      onActiveChange(null);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);

    return () => {
      video.pause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
    };
  }, [messageId, onActiveChange, shouldLoad, src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || isExpanded || video.paused) {
      return;
    }

    shouldAutoPlayRef.current = false;
    video.pause();
  }, [isExpanded]);

  const togglePlayback = async () => {
    if (!shouldLoad) {
      onActiveChange(messageId);
      shouldAutoPlayRef.current = true;
      forceLoad();
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      try {
        onActiveChange(messageId);
        await video.play();
      } catch {
        onActiveChange(null);
        toast.error("Nao foi possivel reproduzir o video.");
      }
      return;
    }

    shouldAutoPlayRef.current = false;
    video.pause();
  };

  const displayedTime =
    isPlaying && currentTime > 0
      ? formatMediaDuration(Math.max(duration - currentTime, 0))
      : formatMediaDuration(duration > 0 ? duration : currentTime);

  return (
    <div
      ref={containerRef}
      className={cn(
        "max-w-full origin-center transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isExpanded ? "w-[252px] sm:w-[264px]" : "w-[220px]",
      )}
      data-prevent-message-quote="true"
    >
      <button
        type="button"
        className={cn(
          "group relative block aspect-square w-full overflow-hidden rounded-full bg-black/85 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isExpanded
            ? "scale-[1.02] shadow-[0_24px_48px_rgba(15,23,42,0.24)]"
            : "scale-100 shadow-[0_18px_34px_rgba(15,23,42,0.18)]",
        )}
        onClick={() => {
          void togglePlayback();
        }}
        aria-label={isPlaying ? "Pausar video" : "Reproduzir video"}
      >
        <video
          ref={videoRef}
          src={shouldLoad ? src : undefined}
          playsInline
          preload={shouldLoad ? "metadata" : "none"}
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300",
            isLoading || !shouldLoad || hasError ? "opacity-0" : "opacity-100",
          )}
        />

        {(isLoading || !shouldLoad) && !hasError ? (
          <MediaLoadingSkeleton
            width="w-full"
            height="h-full"
            rounded="rounded-full"
          />
        ) : null}

        {hasError ? (
          <span className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs text-white/80">
            Nao foi possivel carregar o video.
          </span>
        ) : null}

        {!hasError ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/42" />
        ) : null}

        {!isLoading && !hasError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full border border-white/18 bg-white/28 text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur-md transition-all duration-200",
                isPlaying
                  ? "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
                  : "opacity-100 scale-100",
              )}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="ml-1 h-6 w-6 fill-current" />
              )}
            </div>
          </div>
        ) : null}

        {!hasError ? (
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/16 bg-black/42 px-3 py-1 text-[11px] font-medium tabular-nums text-white/92 backdrop-blur-sm">
            {displayedTime}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function CompactAudioPlayer({
  src,
  isVoiceMessage,
  outgoing,
}: {
  src: string;
  isVoiceMessage: boolean;
  outgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsLoading(false);
    };

    const handleCanPlay = () => setIsLoading(false);

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, [src]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        toast.error("Nao foi possivel reproduzir este audio.");
      }
      return;
    }

    audio.pause();
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;

    if (!audio || !duration) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <div className="w-[280px] max-w-full">
      <audio ref={audioRef} src={src} preload="metadata" />
      {isLoading ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/10">
            <div className="relative flex h-5 w-5 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--text-bubble-meta)]" />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-[8px] w-full animate-pulse rounded-full bg-foreground/10" />
            <div className="h-[6px] w-16 animate-pulse rounded-full bg-foreground/10" />
          </div>
        </div>
      ) : null}
      <div className={cn("flex items-center gap-3", isLoading ? "hidden" : "")}>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/15 text-foreground transition hover:bg-foreground/25"
          onClick={() => {
            void togglePlayback();
          }}
        >
          {isPlaying ? (
            <Pause className="h-[18px] w-[18px] fill-current" />
          ) : (
            <Play className="ml-0.5 h-[18px] w-[18px] fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* Waveform + seekbar */}
          <div className="relative flex h-[28px] items-center">
            <div className="pointer-events-none absolute inset-x-0 flex items-center justify-between gap-[1px]">
              {AUDIO_WAVEFORM_BARS.map((barHeight, index) => {
                const threshold =
                  ((index + 1) / AUDIO_WAVEFORM_BARS.length) * 100;
                return (
                  <span
                    key={`${barHeight}-${index}`}
                    className={cn(
                      "rounded-full transition-colors duration-150",
                      progress >= threshold
                        ? outgoing
                          ? "bg-[var(--text-link-blue)]"
                          : "bg-primary"
                        : outgoing
                          ? "bg-[var(--text-bubble-meta)]"
                          : "bg-foreground/18",
                    )}
                    style={{
                      height: `${Math.max(3, Math.round(barHeight * 0.7))}px`,
                      width: "3px",
                      flexShrink: 0,
                    }}
                  />
                );
              })}
            </div>
            {/* Seek dot indicator */}
            <div
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full shadow-sm transition-[left]",
                outgoing ? "bg-[var(--text-link-blue)]" : "bg-primary",
              )}
              style={{ left: `calc(${Math.min(progress, 100)}% - 5px)` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={duration ? currentTime : 0}
              onChange={(event) => handleSeek(Number(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          {/* Duration + mic icon */}
          <div className="mt-0.5 flex items-center justify-between text-[10px] opacity-50">
            <span>
              {formatMediaDuration(
                isPlaying ? currentTime : duration > 0 ? duration : currentTime,
              )}
            </span>
            {isVoiceMessage && <Mic className="h-2.5 w-2.5" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeConversationMessageType(messageType?: string | null) {
  const normalized = (messageType ?? "").trim().toLowerCase();

  const typeMap: Record<string, string> = {
    chat: "text",
    voice: "audio",
    ptt: "audio",
    video_note: "video",
    video_note_message: "video",
    animated_sticker: "sticker",
  };

  if (!normalized) {
    return "text";
  }

  return typeMap[normalized] ?? normalized;
}

function isVideoNoteConversationMessageType(messageType?: string | null) {
  const normalized = (messageType ?? "").trim().toLowerCase();

  return (
    normalized === "video_note" ||
    normalized === "video_note_message" ||
    normalized === "videonote" ||
    normalized === "video note" ||
    normalized === "ptv" ||
    normalized === "round_video"
  );
}

function getEffectiveConversationMessageType(message: ConversationMessage) {
  const normalizedMessageType = normalizeConversationMessageType(
    message.messageType,
  );
  const mediaMetadata = resolveMessageMediaMetadata(message.metadata);
  const hasUnknownMedia =
    mediaMetadata.hasAttachment &&
    ![
      "image",
      "sticker",
      "audio",
      "video",
      "document",
      "template",
      "text",
    ].includes(normalizedMessageType);

  if (!hasUnknownMedia) {
    return normalizedMessageType;
  }

  const mimeType = mediaMetadata.mimeType ?? "";

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return normalizedMessageType;
}

function shouldUseStandaloneConversationMediaBubble(
  message: ConversationMessage,
) {
  if (message.direction === "SYSTEM") {
    return false;
  }

  if (hasRenderableConversationQuote(message.metadata?.quote)) {
    return false;
  }

  if (isVideoNoteConversationMessageType(message.messageType)) {
    return true;
  }

  if (getMessageCaption(message)) {
    return false;
  }

  const effectiveType = getEffectiveConversationMessageType(message);

  if (effectiveType === "image" || effectiveType === "sticker") {
    return true;
  }

  if (
    effectiveType === "video" &&
    !isVideoNoteConversationMessageType(message.messageType)
  ) {
    return true;
  }

  return false;
}

function shouldOverlayStandaloneConversationMediaMeta(
  message: ConversationMessage,
) {
  const effectiveType = getEffectiveConversationMessageType(message);

  return (
    (effectiveType === "image" || effectiveType === "sticker") &&
    !isVideoNoteConversationMessageType(message.messageType)
  );
}

function canQuoteMessage(message: ConversationMessage) {
  return message.direction !== "SYSTEM" && message.status !== "QUEUED";
}

function canQuoteMessageByDoubleClick(message: ConversationMessage) {
  if (!canQuoteMessage(message)) {
    return false;
  }

  const effectiveType = getEffectiveConversationMessageType(message);

  return (
    effectiveType === "text" ||
    effectiveType === "template" ||
    Boolean(resolveInternalMessageMetadata(message.metadata))
  );
}

function resolveInternalMessageMetadata(
  messageMetadata: ConversationMessage["metadata"],
) {
  const internalMessage = messageMetadata?.internalMessage;

  if (!internalMessage || typeof internalMessage !== "object") {
    return null;
  }

  return internalMessage;
}

function resolveMessageMediaMetadata(
  messageMetadata: ConversationMessage["metadata"],
) {
  const metadataAsRecord =
    messageMetadata &&
    typeof messageMetadata === "object" &&
    !Array.isArray(messageMetadata)
      ? (messageMetadata as Record<string, unknown>)
      : null;
  const media = metadataAsRecord?.media;
  const mediaAsRecord =
    media && typeof media === "object" && !Array.isArray(media)
      ? (media as Record<string, unknown>)
      : null;

  const pickString = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  };

  return {
    hasAttachment:
      Boolean(mediaAsRecord) ||
      Boolean(
        pickString(
          messageMetadata?.fileName,
          metadataAsRecord?.file_name,
          metadataAsRecord?.filename,
          mediaAsRecord?.fileName,
          mediaAsRecord?.file_name,
          mediaAsRecord?.filename,
          metadataAsRecord?.documentName,
        ),
      ) ||
      Boolean(
        pickString(
          messageMetadata?.mimeType,
          metadataAsRecord?.mime_type,
          metadataAsRecord?.mimetype,
          mediaAsRecord?.mimeType,
          mediaAsRecord?.mime_type,
          mediaAsRecord?.mimetype,
        ),
      ),
    mediaId: pickString(
      messageMetadata?.mediaId,
      metadataAsRecord?.media_id,
      metadataAsRecord?.id,
      mediaAsRecord?.mediaId,
      mediaAsRecord?.media_id,
      mediaAsRecord?.id,
    ),
    fileName: pickString(
      messageMetadata?.fileName,
      metadataAsRecord?.file_name,
      metadataAsRecord?.filename,
      mediaAsRecord?.fileName,
      mediaAsRecord?.file_name,
      mediaAsRecord?.filename,
      metadataAsRecord?.documentName,
    ),
    mimeType: pickString(
      messageMetadata?.mimeType,
      metadataAsRecord?.mime_type,
      metadataAsRecord?.mimetype,
      mediaAsRecord?.mimeType,
      mediaAsRecord?.mime_type,
      mediaAsRecord?.mimetype,
    ),
  };
}

function isPdfConversationMedia(
  mediaMetadata: ReturnType<typeof resolveMessageMediaMetadata>,
) {
  const mimeType = mediaMetadata.mimeType?.toLowerCase() ?? "";
  const fileName = mediaMetadata.fileName?.toLowerCase() ?? "";

  return mimeType.includes("pdf") || fileName.endsWith(".pdf");
}

function buildMessageQuotePreview(message: ConversationMessage) {
  const content = message.content?.trim();

  if (content && !HIDDEN_MEDIA_LABELS.has(content)) {
    return content.slice(0, 220);
  }

  const normalizedType = normalizeConversationMessageType(message.messageType);
  const mediaMetadata = resolveMessageMediaMetadata(message.metadata);

  if (normalizedType === "document") {
    return mediaMetadata.fileName
      ? `Documento: ${mediaMetadata.fileName}`
      : "Documento";
  }

  if (normalizedType === "template") {
    return message.metadata?.templateName
      ? `Template: ${message.metadata.templateName}`
      : "Template enviado";
  }

  if (normalizedType === "image") return "Imagem";
  if (normalizedType === "audio") {
    return message.metadata?.voice ? "Mensagem de voz" : "Audio";
  }
  if (normalizedType === "video") return "Video";
  if (normalizedType === "sticker") return "Figurinha";

  return content?.slice(0, 220) || "Mensagem";
}

function buildQuoteMetadataForComposer(message?: ConversationMessage | null) {
  if (!message) {
    return null;
  }

  return {
    quote: {
      messageId: message.id,
      contentPreview: buildMessageQuotePreview(message),
      messageType: normalizeConversationMessageType(message.messageType),
      direction: message.direction,
      createdAt: getConversationMessageTimestamp(message),
    },
  };
}

function getMessageCaption(message: ConversationMessage) {
  const content = message.content?.trim();

  if (!content) {
    return null;
  }

  if (HIDDEN_MEDIA_LABELS.has(content)) {
    return null;
  }

  if (
    normalizeConversationMessageType(message.messageType) === "document" &&
    content.startsWith("Documento:")
  ) {
    return null;
  }

  return content;
}

function getCopyableMessageText(message: ConversationMessage) {
  const caption = getMessageCaption(message);

  if (caption) {
    return caption;
  }

  const preview = buildMessageQuotePreview(message);

  return preview === "Mensagem" ? null : preview;
}

function formatMediaDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getConstrainedMediaDimensions(
  size: { width: number; height: number },
  limits: { maxWidth: number; maxHeight: number },
) {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const scale = Math.min(
    1,
    limits.maxWidth / size.width,
    limits.maxHeight / size.height,
  );

  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}

function getPreferredRecordingMimeType(): RecordingMimeConfig | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const candidates: RecordingMimeConfig[] = [
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return null;
}

function inferRecordingMimeConfig(mimeType: string): RecordingMimeConfig {
  if (mimeType.includes("ogg")) {
    return { mimeType, extension: "ogg" };
  }

  if (mimeType.includes("mp4")) {
    return { mimeType, extension: "m4a" };
  }

  return { mimeType, extension: "webm" };
}

function stopRecordingStream(streamRef: MutableRefObject<MediaStream | null>) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}
