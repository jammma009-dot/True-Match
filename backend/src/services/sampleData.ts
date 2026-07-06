import { prisma } from "../lib/prisma";
import { Gender, Intent, City, Habit } from "@prisma/client";

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
  heightCm: number;
  bio: string;
  smoking: Habit;
  drinking: Habit;
  interests: string[];
}

const FAKES: FakeUser[] = [
  { telegramId: -1001, name: "Dilnoza", age: 24, gender: "female", intent: "serious", city: "toshkent", photos: 3, heightCm: 168, bio: "Kofe, kitob va uzoq sayrlarni yaxshi ko'raman ☕", smoking: "never", drinking: "never", interests: ["coffee", "books", "travel", "music"] },
  { telegramId: -1002, name: "Aziz", age: 27, gender: "male", intent: "serious", city: "toshkent", photos: 2, heightCm: 182, bio: "Sport va sayohat — mening hayotim.", smoking: "never", drinking: "sometimes", interests: ["sports", "fitness", "travel"] },
  { telegramId: -1003, name: "Kamila", age: 22, gender: "female", intent: "flirt", city: "samarqand", photos: 3, heightCm: 165, bio: "Raqs va musiqa ishqibozi 💃", smoking: "sometimes", drinking: "sometimes", interests: ["dancing", "music", "fashion", "photography"] },
  { telegramId: -1004, name: "Jasur", age: 30, gender: "male", intent: "marriage", city: "toshkent", photos: 2, heightCm: 178, bio: "Oila qurishni xohlayman. Pazandachilikni yaxshi ko'raman.", smoking: "never", drinking: "never", interests: ["cooking", "food", "nature"] },
  { telegramId: -1005, name: "Nigora", age: 26, gender: "female", intent: "friendship", city: "buxoro", photos: 2, heightCm: 170, bio: "Yangi do'stlar orttirishni istayman 🌿", smoking: "never", drinking: "never", interests: ["nature", "art", "coffee"] },
  { telegramId: -1006, name: "Sardor", age: 29, gender: "male", intent: "flirt", city: "toshkent", photos: 3, heightCm: 185, bio: "Gamer va film ishqibozi 🎮", smoking: "sometimes", drinking: "often", interests: ["gaming", "movies", "music"] },
  { telegramId: -1007, name: "Malika", age: 23, gender: "female", intent: "serious", city: "andijon", photos: 2, heightCm: 162, bio: "Fitnes va sog'lom hayot tarzi 💪", smoking: "never", drinking: "never", interests: ["fitness", "sports", "cooking"] },
  { telegramId: -1008, name: "Bekzod", age: 28, gender: "male", intent: "friendship", city: "namangan", photos: 2, heightCm: 176, bio: "Fotografiya va tabiat.", smoking: "never", drinking: "sometimes", interests: ["photography", "nature", "travel"] },
  { telegramId: -1009, name: "Sevara", age: 25, gender: "female", intent: "marriage", city: "toshkent", photos: 3, heightCm: 172, bio: "Mehribon va samimiy insonman ❤️", smoking: "never", drinking: "never", interests: ["food", "books", "pets"] },
  { telegramId: -1010, name: "Timur", age: 31, gender: "male", intent: "unsure", city: "fargona", photos: 2, heightCm: 180, bio: "Hayotdan zavq olaman.", smoking: "often", drinking: "often", interests: ["music", "gaming", "sports"] },
  { telegramId: -1011, name: "Gulnora", age: 27, gender: "female", intent: "serious", city: "toshkent", photos: 3, heightCm: 167, bio: "San'at va moda dunyosidaman 🎨", smoking: "never", drinking: "sometimes", interests: ["art", "fashion", "coffee", "movies"] },
  { telegramId: -1012, name: "Madina", age: 21, gender: "female", intent: "flirt", city: "toshkent", photos: 2, heightCm: 160, bio: "Uy hayvonlarini yaxshi ko'raman 🐾", smoking: "never", drinking: "never", interests: ["pets", "music", "dancing"] },
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

    const data = {
      name: f.name,
      birthdate: birthdateForAge(f.age),
      gender: f.gender,
      intent: f.intent,
      city: f.city,
      status: "approved" as const,
      genderLocked: true,
      heightCm: f.heightCm,
      bio: f.bio,
      smoking: f.smoking,
      drinking: f.drinking,
      interests: f.interests,
    };

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
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
