import {
  LucideIcon,
  Trophy,
  Film,
  Music,
  Music2,
  UtensilsCrossed,
  Plane,
  BookOpen,
  Gamepad2,
  Palette,
  ChefHat,
  Dumbbell,
  Trees,
  Camera,
  Coffee,
  PawPrint,
  Shirt,
  Cigarette,
  Wine,
  Mars,
  Venus,
  Heart,
  Gem,
  Sparkles,
  Users,
  HelpCircle,
} from "lucide-react";

/**
 * Clean SVG (Lucide) icons for profile attributes — no emojis.
 * Labels are localized via i18n (keys `interest.<key>`, `habit.<key>`, etc.).
 */
export const INTEREST_ICON: Record<string, LucideIcon> = {
  sports: Trophy,
  movies: Film,
  music: Music,
  food: UtensilsCrossed,
  travel: Plane,
  books: BookOpen,
  gaming: Gamepad2,
  art: Palette,
  cooking: ChefHat,
  fitness: Dumbbell,
  nature: Trees,
  photography: Camera,
  coffee: Coffee,
  pets: PawPrint,
  dancing: Music2,
  fashion: Shirt,
};

export const GENDER_ICON: Record<string, LucideIcon> = {
  male: Mars,
  female: Venus,
};

export const INTENT_ICON: Record<string, LucideIcon> = {
  serious: Heart,
  marriage: Gem,
  flirt: Sparkles,
  friendship: Users,
  unsure: HelpCircle,
};

export const SmokingIcon = Cigarette;
export const DrinkingIcon = Wine;

export const DEFAULT_MIN_HEIGHT = 140;
export const DEFAULT_MAX_HEIGHT = 220;
