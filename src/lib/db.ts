import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/databaseUrl";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = new URL(getDatabaseUrl());
  // Uzak sunucu: bağlantı kurulumu birkaç saniye sürebiliyor, süreleri geniş tut
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 5,
    connectTimeout: 20_000,
    acquireTimeout: 30_000,
    idleTimeout: 300,
    timezone: "Z",
  });
  return new PrismaClient({ adapter });
}

/** İstemci ilk kullanımda oluşturulur; build sırasında DB ayarı olmadan modül yüklenebilir. */
function getClient() {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
