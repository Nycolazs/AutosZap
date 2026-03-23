'use client';

export type TicketCategory = 'IMPROVEMENT' | 'BUG' | 'QUESTION';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportTicketMessageSenderType = 'CUSTOMER' | 'PLATFORM';

export type SupportTicketMessage = {
  id: string;
  body: string;
  senderType: SupportTicketMessageSenderType;
  senderName: string;
  senderEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketSummary = {
  id: string;
  title: string;
  body: string;
  category: TicketCategory;
  status: TicketStatus;
  companyName: string;
  authorName: string;
  authorEmail: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketDetail = SupportTicketSummary & {
  messages: SupportTicketMessage[];
};
