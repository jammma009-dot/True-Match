import { prisma } from "../lib/prisma";
import { Gender, Intent, City } from "@prisma/client";

/**
 * Sample/test profiles used to populate the discovery feed for testing.
 * These use fake NEGATIVE telegramIds so they never collide with real users,
 * and are easy to identify/remove later. Photos are picsum.photos placeholders.
 *
 * Exposed via POST /api/admin/seed (admin-only) and the "Load sample profiles"
 * button in the admin panel.
 */
interface FakeUser {
  telegramId: number;
  name: string;
  age: number;
  gender: Gender;
  intent: Intent;
  city: City;
  photos: number;
}

const FAKES: FakeUser[] = [
  { telegramId: -1001, name: "Dilnoza", age: 24, gender: "female", intent: "serious", city: "toshkent", photos: 3 },
  { telegramId: -1002, name: "Aziz", age: 27, gender: "male", intent: "serious", city: "toshkent", photos: 2 },
  { telegramId: -1003, name: "Kamila", age: 22, gender: "female", intent: "flirt", city: "samarqand", photos: 3 },
  { telegramId: -1004, name: "Jasur", age: 30, gender: "male", intent: "marriage", city: "toshkent", photos: 2 },
  { telegramId: -1005, name: "Nigora", age: 26, gender: "female", intent: "friendship", city: "buxoro", photos: 2 },
  { telegramId: -1006, name: "Sardor", age: 29, gender: "male", intent: "flirt", city: "toshkent", photos: 3 },
  { telegramId: -1007, name: "Malika", age: 23, gender: "female", intent: "serious", city: "andijon", photos: 2 },
  { telegramId: -1008, name: "Bekzod", age: 28, gender: "male", intent: "friendship", city: "namangan", photos: 2 },
  { telegramId: -1009, name: "Sevara", age: 25, gender: "female", intent: "marriage", city: "toshkent", photos: 3 },
  { telegramId: -1010, name: "Timur", age: 31, gender: "male", intent: "unsure", city: "fargona", photos: 2 },
  { telegramId: -1011, name: "Gulnora", age: 27, gender: "female", intent: "serious", city: "toshkent", photos: 3 },
  { telegramId: -1012, name: "Madina", age: 21, gender: "female", intent: "flirt", city: "toshkent", photos: 2 },
];

function birthdateForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

/**
 * Create (or refresh) the sample profiles. Idempotent — safe to run repeatedly.
 * Returns the number of sample profiles now present.
 */
export async function createSampleProfiles(): Promise<number> {
  for (const f of FAKES) {
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(f.telegramId) },
      update: {},
      create: { telegramId: BigInt(f.telegramId), language: "uz" },
    });

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        name: f.name,
        birthdate: birthdateForAge(f.age),
        gender: f.gender,
        intent: f.intent,
        city: f.city,
        status: "approved",
        genderLocked: true,
      },
      create: {
        userId: user.id,
        name: f.name,
        birthdate: birthdateForAge(f.age),
        gender: f.gender,
        intent: f.intent,
        city: f.city,
        status: "approved",
        genderLocked: true,
      },
    });

    await prisma.photo.deleteMany({ where: { profileId: profile.id } });
    await prisma.photo.createMany({
      data: Array.from({ length: f.photos }).map((_, i) => ({
        profileId: profile.id,
        key: `seed/${f.telegramId}/${i}.jpg`,
        url: `https://picsum.photos/seed/${Math.abs(f.telegramId)}${i}/600/800`,
        position: i,
      })),
    });
  }

  return FAKES.length;
}

/**
 * Remove all sample profiles (the fake negative-telegramId users).
 */
export async function removeSampleProfiles(): Promise<number> {
  const ids = FAKES.map((f) => BigInt(f.telegramId));
  const result = await prisma.user.deleteMany({
    where: { telegramId: { in: ids } },
  });
  return result.count;
}
