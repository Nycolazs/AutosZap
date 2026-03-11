'use client';

import { create } from 'zustand';

type UiState = {
  sidebarOpen: boolean;
  inboxDetailsOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInboxDetailsOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  inboxDetailsOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setInboxDetailsOpen: (inboxDetailsOpen) => set({ inboxDetailsOpen }),
}));
