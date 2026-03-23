'use client';

import { MessageSquareText } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type {
  SupportTicketDetail,
  SupportTicketMessageSenderType,
} from './support-ticket-types';

type SupportTicketThreadProps = {
  ticket: SupportTicketDetail;
  viewer: 'customer' | 'platform';
  className?: string;
};

type ThreadMessage = {
  id: string;
  body: string;
  senderType: SupportTicketMessageSenderType;
  senderName: string;
  senderEmail: string | null;
  createdAt: string;
  isOpeningMessage?: boolean;
};

function isOwnMessage(
  viewer: SupportTicketThreadProps['viewer'],
  senderType: SupportTicketMessageSenderType,
) {
  return (
    (viewer === 'customer' && senderType === 'CUSTOMER') ||
    (viewer === 'platform' && senderType === 'PLATFORM')
  );
}

export function SupportTicketThread({
  ticket,
  viewer,
  className,
}: SupportTicketThreadProps) {
  const messages: ThreadMessage[] = [
    {
      id: `${ticket.id}-opening-message`,
      body: ticket.body,
      senderType: 'CUSTOMER',
      senderName: ticket.authorName,
      senderEmail: ticket.authorEmail,
      createdAt: ticket.createdAt,
      isOpeningMessage: true,
    },
    ...ticket.messages.map((message) => ({
      id: message.id,
      body: message.body,
      senderType: message.senderType,
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      createdAt: message.createdAt,
    })),
  ];

  return (
    <div className={cn('space-y-3', className)}>
      {messages.map((message) => {
        const own = isOwnMessage(viewer, message.senderType);
        return (
          <div
            key={message.id}
            className={cn(
              'flex w-full',
              own ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[90%] rounded-2xl border px-3 py-3 shadow-[0_14px_30px_rgba(3,8,20,0.18)] sm:max-w-[82%]',
                own
                  ? 'border-primary/30 bg-primary/12 text-foreground'
                  : 'border-border bg-white/[0.03] text-foreground/90',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {message.senderName}
                </span>
                {message.isOpeningMessage ? (
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                    Abertura
                  </span>
                ) : null}
                <span>{formatDate(message.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6">
                {message.body}
              </p>
            </div>
          </div>
        );
      })}

      {ticket.messages.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border/80 bg-white/[0.02] px-3 py-2 text-[12px] text-muted-foreground">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Ainda nao houve resposta do suporte neste chamado.
        </div>
      ) : null}
    </div>
  );
}
