const MESSAGE_FORMAT_PREFIX_REGEX = /^\*[^*\n]+\*:\n[\s\S]+$/;

function formatSellerName(userName: string) {
  return userName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const [firstChar = '', ...restChars] = part;
      return `${firstChar.toLocaleUpperCase('pt-BR')}${restChars.join('').toLocaleLowerCase('pt-BR')}`;
    })
    .join(' ');
}

export function formatManualMessageContent(userName: string, content: string) {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();

  if (!normalizedContent) {
    return normalizedContent;
  }

  if (MESSAGE_FORMAT_PREFIX_REGEX.test(normalizedContent)) {
    return normalizedContent;
  }

  return `*${formatSellerName(userName)}*:\n${normalizedContent}`;
}
