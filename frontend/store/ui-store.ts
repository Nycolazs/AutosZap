'use client';

import { create } from 'zustand';

type UiState = {
  sidebarOpen: boolean;
  inboxDetailsOpen: boolean;
  activeInboxConversationId: string | null;
  isViewingLatestInboxMessages: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInboxDetailsOpen: (open: boolean) => void;
  setActiveInboxConversationId: (conversationId: string | null) => void;
  setIsViewingLatestInboxMessages: (isViewingLatest: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  inboxDetailsOpen: true,
  activeInboxConversationId: null,
  isViewingLatestInboxMessages: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) =>
    set((state) => (state.sidebarOpen === sidebarOpen ? state : { sidebarOpen })),
  setInboxDetailsOpen: (inboxDetailsOpen) =>
    set((state) =>
      state.inboxDetailsOpen === inboxDetailsOpen
        ? state
        : { inboxDetailsOpen },
    ),
  setActiveInboxConversationId: (activeInboxConversationId) =>
    set((state) =>
      state.activeInboxConversationId === activeInboxConversationId
        ? state
        : { activeInboxConversationId },
    ),
  setIsViewingLatestInboxMessages: (isViewingLatestInboxMessages) =>
    set((state) =>
      state.isViewingLatestInboxMessages === isViewingLatestInboxMessages
        ? state
        : { isViewingLatestInboxMessages },
    ),
}));
