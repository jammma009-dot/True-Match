import { Flame, Heart, MessageCircle, User, LucideIcon } from "lucide-react";
import { useT } from "../store/useStore";
import { haptics } from "../lib/telegram";

export type Tab = "discover" | "likes" | "chats" | "profile";

const TABS: { key: Tab; icon: LucideIcon; labelKey: string }[] = [
  { key: "discover", icon: Flame, labelKey: "nav.discover" },
  { key: "likes", icon: Heart, labelKey: "nav.likes" },
  { key: "chats", icon: MessageCircle, labelKey: "nav.chats" },
  { key: "profile", icon: User, labelKey: "nav.profile" },
];

/**
 * Bottom tab bar. When `disabled` (pending/rejected state) the tabs are visible
 * but dimmed and non-interactive.
 */
export function BottomNav({
  active,
  onChange,
  disabled = false,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <nav
      className={`flex flex-shrink-0 border-t border-white/5 bg-[var(--tg-secondary-bg-color)]/95 backdrop-blur ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active && !disabled;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (disabled) return;
              haptics.select();
              onChange(tab.key);
            }}
            className="flex flex-1 touch-manipulation flex-col items-center gap-1 pb-2 pt-2.5"
          >
            <Icon
              className={`h-6 w-6 transition-colors ${isActive ? "text-brand" : "text-tg-hint"}`}
              strokeWidth={isActive ? 2.5 : 2}
              fill={isActive && (tab.key === "likes") ? "currentColor" : "none"}
            />
            <span
              className={`text-[11px] font-medium transition-colors ${
                isActive ? "text-brand" : "text-tg-hint"
              }`}
            >
              {t(tab.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
