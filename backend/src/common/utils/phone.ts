function extractDigits(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

function normalizeBrazilNationalNumber(digits: string) {
  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length !== 10 && nationalDigits.length !== 11) {
    return null;
  }

  if (
    nationalDigits.length === 10 &&
    /^[6-9]$/.test(nationalDigits.charAt(2))
  ) {
    return `${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`;
  }

  return nationalDigits;
}

function buildBrazilianPhoneVariants(digits: string) {
  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length !== 10 && nationalDigits.length !== 11) {
    return [];
  }

  const variants = new Set<string>();

  if (nationalDigits.length === 11) {
    variants.add(`+55${nationalDigits}`);

    if (nationalDigits.charAt(2) === '9') {
      variants.add(
        `+55${nationalDigits.slice(0, 2)}${nationalDigits.slice(3)}`,
      );
    }

    return [...variants];
  }

  variants.add(`+55${nationalDigits}`);

  if (/^[6-9]$/.test(nationalDigits.charAt(2))) {
    variants.add(`+55${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`);
  }

  return [...variants];
}

export function normalizeContactPhone(value?: string | null) {
  const digits = extractDigits(value);

  if (!digits) {
    return '';
  }

  const normalizedBrazilianNumber = normalizeBrazilNationalNumber(digits);

  if (normalizedBrazilianNumber) {
    return `+55${normalizedBrazilianNumber}`;
  }

  return `+${digits}`;
}

export function buildEquivalentContactPhones(value?: string | null) {
  const digits = extractDigits(value);

  if (!digits) {
    return [];
  }

  const brazilianVariants = buildBrazilianPhoneVariants(digits);

  if (brazilianVariants.length) {
    return brazilianVariants;
  }

  return [`+${digits}`];
}

export function normalizeSearchPhone(value?: string | null) {
  const digits = extractDigits(value);

  if (!digits) {
    return [];
  }

  return buildEquivalentContactPhones(digits).map((phone) =>
    phone.replace(/\D/g, ''),
  );
}
