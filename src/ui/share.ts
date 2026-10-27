/**
 * Share a link with the phone's share sheet when there is one, otherwise copy
 * it. Nothing is sent anywhere by the app itself: the person picks where it goes.
 */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Some browsers expose share() but refuse it: fall through to copy.
    }
  }
  return copyText(`${data.text} ${data.url}`.trim());
}

export async function copyText(text: string): Promise<ShareResult> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
