import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listCustomerServices, listCategories } from '@/lib/services';
import { createOrder, getOrderWithFreshStatus, listOrdersFor } from '@/lib/orders';
import { sendMessage, answerCallbackQuery, editMessageText } from '@/lib/telegram/api';
import { getSession, setSession, clearSession } from '@/lib/telegram/session';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  IN_PROGRESS: 'Diproses',
  PROCESSING: 'Diproses',
  COMPLETED: 'Selesai',
  PARTIAL: 'Sebagian',
  CANCELED: 'Dibatalkan',
  ERROR: 'Gagal',
};

function fmt(n: number) {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function mainMenu() {
  return [[{ text: 'Lihat Services', callback_data: 'menu:services' }], [{ text: 'Order Saya', callback_data: 'menu:orders' }]];
}

/**
 * POST /api/telegram/webhook
 * Telegram calls this on every update. Verified via the `secret_token`
 * header Telegram sends when a webhook is registered with one (see
 * lib/telegram/api.ts setWebhook and README for setup) — this is what
 * stops randoms from POSTing fake updates at this route.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  try {
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (err: any) {
    console.error('[telegram/webhook] handler error:', err.message);
  }

  // Always 200 — Telegram retries aggressively on non-200, which would
  // otherwise replay the same update (and e.g. double-create an order)
  // if our handler throws after partially completing work.
  return NextResponse.json({ ok: true });
}

async function handleMessage(message: any) {
  const chatId = String(message.chat.id);
  const text: string | undefined = message.text?.trim();
  if (!text) return;

  if (text === '/start') {
    await clearSession(chatId);
    await sendMessage(chatId, 'Selamat datang di SMM Panel.\n\nPilih menu di bawah untuk mulai order.', mainMenu());
    return;
  }

  if (text === '/orders') {
    await sendOrderHistory(chatId);
    return;
  }

  if (text === '/sync' && chatId === process.env.TELEGRAM_ADMIN_CHAT_ID) {
    await sendMessage(chatId, 'Sync service belum dijalankan dari sini di MVP ini — pakai POST /api/services/sync.');
    return;
  }

  // Anything else is only meaningful in the middle of an order flow.
  const session = await getSession(chatId);

  if (session.step === 'AWAITING_QUANTITY') {
    await handleQuantityInput(chatId, session.data.serviceId!, text);
    return;
  }

  if (session.step === 'AWAITING_LINK') {
    await handleLinkInput(chatId, session.data, text);
    return;
  }

  await sendMessage(chatId, 'Ketik /start untuk melihat menu.');
}

async function handleQuantityInput(chatId: string, serviceId: string, text: string) {
  const quantity = Number(text.replace(/[^\d]/g, ''));
  const services = await listCustomerServices();
  const service = services.find((s) => s.id === serviceId);
  if (!service) {
    await clearSession(chatId);
    await sendMessage(chatId, 'Service tidak ditemukan. /start untuk mulai lagi.');
    return;
  }
  if (!quantity || quantity < service.min || quantity > service.max) {
    await sendMessage(chatId, `Quantity tidak valid. Masukkan angka antara ${service.min} dan ${service.max}.`);
    return;
  }

  if (service.requiredParams.includes('link')) {
    await setSession(chatId, 'AWAITING_LINK', { serviceId, quantity });
    await sendMessage(chatId, 'Masukkan link/target (contoh: https://instagram.com/namaakun):');
    return;
  }

  await showConfirm(chatId, { serviceId, quantity });
}

async function handleLinkInput(chatId: string, data: { serviceId?: string; quantity?: number }, text: string) {
  if (!/^https?:\/\//i.test(text)) {
    await sendMessage(chatId, 'Link harus dimulai dengan http:// atau https://. Coba lagi:');
    return;
  }
  await showConfirm(chatId, { serviceId: data.serviceId!, quantity: data.quantity!, link: text });
}

async function showConfirm(chatId: string, data: { serviceId: string; quantity: number; link?: string }) {
  const services = await listCustomerServices();
  const service = services.find((s) => s.id === data.serviceId);
  if (!service) {
    await clearSession(chatId);
    await sendMessage(chatId, 'Service tidak ditemukan. /start untuk mulai lagi.');
    return;
  }
  const price = (service.pricePer1000 / 1000) * data.quantity;
  await setSession(chatId, 'CONFIRM', data);

  const lines = [
    `Konfirmasi order:`,
    ``,
    `Service: ${service.name}`,
    data.link ? `Link: ${data.link}` : undefined,
    `Quantity: ${data.quantity.toLocaleString('id-ID')}`,
    `Total: ${fmt(price)}`,
  ].filter(Boolean);

  await sendMessage(chatId, lines.join('\n'), [
    [
      { text: 'Konfirmasi', callback_data: 'order:confirm' },
      { text: 'Batal', callback_data: 'order:cancel' },
    ],
  ]);
}

async function sendOrderHistory(chatId: string) {
  const orders = await listOrdersFor(chatId);
  if (orders.length === 0) {
    await sendMessage(chatId, 'Belum ada order. Ketik /start untuk mulai.');
    return;
  }
  const buttons = orders.map((o) => [
    { text: `#${o.id.slice(-6)} · ${o.service.displayName ?? o.service.name} · ${STATUS_LABEL[o.status]}`, callback_data: `status:${o.id}` },
  ]);
  await sendMessage(chatId, 'Order terakhir Anda:', buttons);
}

async function handleCallback(cb: any) {
  const chatId = String(cb.message.chat.id);
  const messageId = cb.message.message_id;
  const data: string = cb.data;

  await answerCallbackQuery(cb.id);

  if (data === 'menu:services') {
    const categories = await listCategories();
    if (categories.length === 0) {
      await editMessageText(chatId, messageId, 'Belum ada service tersedia. Coba lagi nanti.');
      return;
    }
    await editMessageText(
      chatId,
      messageId,
      'Pilih kategori:',
      categories.map((c) => [{ text: c, callback_data: `cat:${c}` }])
    );
    return;
  }

  if (data === 'menu:orders') {
    await sendOrderHistory(chatId);
    return;
  }

  if (data.startsWith('cat:')) {
    const category = data.slice(4);
    const services = await listCustomerServices({ category });
    if (services.length === 0) {
      await editMessageText(chatId, messageId, 'Tidak ada service di kategori ini.');
      return;
    }
    await editMessageText(
      chatId,
      messageId,
      `Kategori: ${category}`,
      services.map((s) => [{ text: `${s.name} — ${fmt(s.pricePer1000)}/1000`, callback_data: `svc:${s.id}` }])
    );
    return;
  }

  if (data.startsWith('svc:')) {
    const serviceId = data.slice(4);
    const services = await listCustomerServices();
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      await editMessageText(chatId, messageId, 'Service tidak ditemukan.');
      return;
    }
    await setSession(chatId, 'AWAITING_QUANTITY', { serviceId });
    const desc = service.description ? `${service.description}\n\n` : '';
    await editMessageText(
      chatId,
      messageId,
      `${service.name}\n\n${desc}Harga: ${fmt(service.pricePer1000)}/1000\nMin: ${service.min.toLocaleString('id-ID')} · Max: ${service.max.toLocaleString('id-ID')}\n\nMasukkan quantity yang diinginkan:`
    );
    return;
  }

  if (data === 'order:confirm') {
    const session = await getSession(chatId);
    if (session.step !== 'CONFIRM' || !session.data.serviceId || !session.data.quantity) {
      await editMessageText(chatId, messageId, 'Sesi order sudah kadaluarsa. /start untuk mulai lagi.');
      return;
    }
    const result = await createOrder({
      serviceId: session.data.serviceId,
      quantity: session.data.quantity,
      link: session.data.link,
      orderedBy: chatId,
      // One idempotency key per confirm tap — Telegram can occasionally
      // deliver the same callback twice, this stops a duplicate order.
      idempotencyKey: `tg:${chatId}:${session.data.serviceId}:${session.data.quantity}:${cb.message.message_id}`,
    });
    await clearSession(chatId);

    if (!result.ok) {
      await editMessageText(chatId, messageId, `Order gagal: ${result.error}`);
      return;
    }
    await editMessageText(
      chatId,
      messageId,
      `Order dibuat.\n\nID: #${result.order.id.slice(-6)}\nStatus: ${STATUS_LABEL[result.order.status]}\n\nKetik /orders untuk cek status kapan saja.`
    );
    return;
  }

  if (data === 'order:cancel') {
    await clearSession(chatId);
    await editMessageText(chatId, messageId, 'Order dibatalkan. Ketik /start untuk mulai lagi.');
    return;
  }

  if (data.startsWith('status:')) {
    const orderId = data.slice(7);
    const order = await getOrderWithFreshStatus(orderId);
    if (!order) {
      await sendMessage(chatId, 'Order tidak ditemukan.');
      return;
    }
    await sendMessage(
      chatId,
      `Order #${order.id.slice(-6)}\nStatus: ${STATUS_LABEL[order.status]}\nQuantity: ${order.quantity?.toLocaleString('id-ID')}\nTotal: ${fmt(order.customerPrice)}`
    );
    return;
  }
}
