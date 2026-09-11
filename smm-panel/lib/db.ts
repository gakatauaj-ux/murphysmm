import { PrismaClient } from '@prisma/client';

// Prevent creating a new PrismaClient (and new connection pool) on every
// hot-reload in dev, and keep a single instance per serverless invocation.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
