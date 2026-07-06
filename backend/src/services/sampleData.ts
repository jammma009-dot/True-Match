import { prisma } from "../lib/prisma";
import { Gender, Intent, City, Habit } from "@prisma/client";

/**
 * Sample/test profiles used to populate the discovery feed for testing.
 * These use fake NEGATIVE telegramIds so they never collide with real users,
 * and are easy to identify/remove later. Photos are picsum.photos placeholders.
 *
 * We generate 25 female + 25 male profiles so that a tester of EITHER gender
 * sees at least 25 likeable candidates — enough to exercise the 20/day free
 * like cap. Exposed via POST /api/admin/seed (admin-only) and the
 * "Load sample profiles" button in the admin panel.
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

const FEMALE_NAMES = [
  "Dilnoza", "Kamila", "Nigora", "Malika", "Sevara", "Gulnora", "Madina",
  "Shahnoza", "Zarina", "Feruza", "Nozima", "Sabina", "Dildora", "Xurshida",
  "Ozoda", "Laylo", "Mohira", "Nilufar", "Aziza", "Rayhona", "Gavhar",
  "Muslima", "Kumush", "Zilola", "Charos",
];

const MALE_NAMES = [
  "Aziz", "Jasur", "Sardor", "Bekzod", "Timur", "Aybek", "Doston", "Ulugbek",
  "Sherzod", "Otabek", "Farrux", "Jahongir", "Rustam", "Shohruh", "Alisher",
  "Bobur", "Davron", "Elyor", "Islom", "Kamron", "Murod", "Nodir", "Sanjar",
  "Umid", "Zafar",
];

const CITIES: City[] = [
  "toshkent", "samarqand", "buxoro", "andijon", "namangan", "fargona",
  "nukus", "qarshi", "navoiy", "jizzax",
];
const INTENTS: Intent[] = ["serious", "marriage", "flirt", "friendship", "unsure"];
const HABITS: Habit[] = ["never", "sometimes", "often"];
const INTERESTS = [
  "coffee", "books", "travel", "music", "sports", "fitness", "dancing",
  "fashion", "photography", "cooking", "food", "nature", "gaming", "movies",
  "art", "pets",
];
const BIOS_F = [
  "Kofe, kitob va uzoq sayrlarni yaxshi ko'raman ☕",
  "Raqs va musiqa ishqibozi 💃",
  "Yangi do'stlar orttirishni istayman 🌿",
  "Mehribon va samimiy insonman ❤️",
  "San'at va moda dunyosidaman 🎨",
  "Hayotni sevaman va tabassumni qadrlayman 😊",
];
const BIOS_M = [
  "Sport va sayohat — mening hayotim.",
  "Oila qurishni xohlayman. Pazandachilikni yaxshi ko'raman.",
  "Gamer va film ishqibozi 🎮",
  "Fotografiya va tabiat.",
  "Hayotdan zavq olaman.",
  "Halol, mehnatkash va hazilkash yigitman.",
];

function build(
  names: string[],
  gender: Gender,
  idBase: number,
  bios: string[],
): FakeUser[] {
  return names.map((name, i) => ({
    telegramId: idBase - i,
    name,
    age: 20 + (i % 15), // 20..34
    gender,
    intent: INTENTS[i % INTENTS.length],
    city: CITIES[i % CITIES.length],
    photos: 2 + (i % 2), // 2 or 3
    heightCm: (gender === "female" ? 158 : 172) + (i % 12),
    bio: bios[i % bios.length],
    smoking: HABITS[i % HABITS.length],
    drinking: HABITS[(i + 1) % HABITS.length],
    interests: [
      INTERESTS[i % INTERESTS.length],
      INTERESTS[(i + 5) % INTERESTS.length],
      INTERESTS[(i + 9) % INTERESTS.length],
      INTERESTS[(i + 12) % INTERESTS.length],
    ].filter((v, idx, arr) => arr.indexOf(v) === idx),
  }));
}

const FAKES: FakeUser[] = [
  ...build(FEMALE_NAMES, "female", -2001, BIOS_F),
  ...build(MALE_NAMES, "male", -3001, BIOS_M),
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
