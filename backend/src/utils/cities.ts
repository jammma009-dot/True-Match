import { City } from "@prisma/client";

/**
 * Fixed Uzbekistan city list. The enum keys match the Prisma `City` enum.
 * `label` is the display name (same in both locales for city names).
 * Extend later by adding rows here and to the Prisma enum + a migration.
 */
export const CITIES: { value: City; label: string }[] = [
  { value: "toshkent", label: "Toshkent" },
  { value: "nukus", label: "Nukus" },
  { value: "andijon", label: "Andijon" },
  { value: "buxoro", label: "Buxoro" },
  { value: "jizzax", label: "Jizzax" },
  { value: "qarshi", label: "Qarshi" },
  { value: "navoiy", label: "Navoiy" },
  { value: "namangan", label: "Namangan" },
  { value: "samarqand", label: "Samarqand" },
  { value: "termiz", label: "Termiz" },
  { value: "guliston", label: "Guliston" },
  { value: "nurafshon", label: "Nurafshon" },
  { value: "fargona", label: "Farg'ona" },
  { value: "urganch", label: "Urganch" },
];

export const CITY_VALUES = CITIES.map((c) => c.value);

export function cityLabel(value: City): string {
  return CITIES.find((c) => c.value === value)?.label ?? value;
}
