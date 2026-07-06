import { prisma } from "./prisma";

/** Fetch (or lazily create) the singleton settings row. */
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}
