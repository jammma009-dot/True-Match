import { PrismaClient, Gender, Intent, City } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds ~10 fake APPROVED profiles so the discovery/swipe feed can be tested
 * immediately. Photos use placeholder URLs (picsum.photos). These use fake,
 * negative telegramIds so they never collide with real Telegram users.
 */

interface FakeUser {
  telegramId: number;
  name: string;
  age: number;
  gender: Gender;
  intent: Intent;
  city: City;
  photos: number; // how many placeholder photos
}

const fakes: FakeUser[] = [
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
];

function birthdateForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

async function main() {
  console.log("Seeding fake profiles...");

  for (const f of fakes) {
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(f.telegramId) },
      update: {},
      create: {
        telegramId: BigInt(f.telegramId),
        language: "uz",
      },
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
        // Deterministic placeholder image per user/slot.
        url: `https://picsum.photos/seed/${Math.abs(f.telegramId)}${i}/600/800`,
        position: i,
      })),
    });

    console.log(`  ✓ ${f.name} (${f.gender}, ${f.city})`);
  }

  console.log("Done. Seeded", fakes.length, "profiles.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
