import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value?: number | string | null) {
  const amount = typeof value === 'string' ? Number(value) : value ?? 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function normalizePhone(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length === 10 && /^[6-9]$/.test(nationalDigits.charAt(2))) {
    return `${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`;
  }

  return nationalDigits;
}

export function normalizeContactPhoneForComparison(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length === 10 || nationalDigits.length === 11) {
    if (
      nationalDigits.length === 10 &&
      /^[6-9]$/.test(nationalDigits.charAt(2))
    ) {
      return `+55${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`;
    }

    return `+55${nationalDigits}`;
  }

  return `+${digits}`;
}

export function formatBrazilPhone(value?: string | null) {
  const digits = normalizePhone(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return value ?? '';
}

export function applyBrazilPhoneMask(value?: string | null) {
  const digits = normalizePhone(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits ? `(${digits}` : '';
  }

  if (digits.length <= 6) {
    return digits.replace(/(\d{2})(\d+)/, '($1) $2');
  }

  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  }

  return digits.replace(/(\d{2})(\d{5})(\d+)/, '($1) $2-$3');
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}
