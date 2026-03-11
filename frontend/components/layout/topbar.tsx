'use client';

import { Bell, LogOut, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function Topbar({
  userName,
  userRole,
}: {
  userName?: string;
  userRole?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
      <div className="relative hidden flex-1 md:block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              router.push(`/app/contatos?search=${encodeURIComponent(query)}`);
            }
          }}
          placeholder="Buscar por contato, conversa ou lead"
          className="h-10 w-full rounded-xl border border-border bg-background-panel pl-11 pr-4 text-sm text-foreground"
        />
      </div>
      <Button variant="secondary" size="icon">
        <Bell className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.03] px-3 py-2">
        <Avatar>
          <AvatarFallback>{userName?.slice(0, 2).toUpperCase() ?? 'AZ'}</AvatarFallback>
        </Avatar>
        <div className="hidden md:block">
          <p className="text-sm font-medium">{userName ?? 'AutoZap Demo'}</p>
          <p className="text-xs text-muted-foreground">{userRole ?? 'Administrador'}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
