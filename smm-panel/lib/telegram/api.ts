import 'server-only';

const TELEGRAM_API = 'https://api.telegram.org/bot';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  return token;
}

async function call(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    // Never log payload verbatim if it ever grows to include secrets; today
    // it only ever contains chat content, so this is safe.
    console.error('[telegram] API error:', data.description);
  }
  return data;
}

export type InlineButton = { text: string; callback_data: string };

export function sendMessage(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  buttons?: InlineButton[][]
) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

export function setWebhook(url: string, secretToken: string) {
  return call('setWebhook', { url, secret_token: secretToken });
}
