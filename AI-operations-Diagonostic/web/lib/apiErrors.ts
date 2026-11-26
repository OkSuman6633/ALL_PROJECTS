export function formatApiValidationError(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) return undefined;

  const messages = detail.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('msg' in entry)) return [];

    const message = entry.msg;
    if (typeof message !== 'string') return [];

    return [message.replace(/^Value error,\s*/, '')];
  });

  return messages.length > 0 ? messages.join(' ') : undefined;
}
