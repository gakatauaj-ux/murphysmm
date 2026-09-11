import { prisma } from '../db';

export type SessionStep = 'IDLE' | 'AWAITING_QUANTITY' | 'AWAITING_LINK' | 'CONFIRM';

export type SessionData = {
  serviceId?: string;
  quantity?: number;
  link?: string;
};

export async function getSession(chatId: string): Promise<{ step: SessionStep; data: SessionData }> {
  const row = await prisma.botSession.findUnique({ where: { chatId } });
  if (!row) return { step: 'IDLE', data: {} };
  return { step: row.step as SessionStep, data: row.data as SessionData };
}

export async function setSession(chatId: string, step: SessionStep, data: SessionData) {
  await prisma.botSession.upsert({
    where: { chatId },
    update: { step, data },
    create: { chatId, step, data },
  });
}

export async function clearSession(chatId: string) {
  await setSession(chatId, 'IDLE', {});
}
