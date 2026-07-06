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
 * but dimmed and non-interactive. `badges` renders an Instagram-style red count
 * bubble on a tab (e.g. unread chats).
 */
export function BottomNav({
  active,
  onChange,
  disabled = false,
  badges = {},
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  disabled?: boolean;
  badges?: Partial<Record<Tab, number>>;
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
        const count = badges[tab.key] ?? 0;
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
            <div className="relative">
              <Icon
                className={`h-6 w-6 transition-colors ${isActive ? "text-brand" : "text-tg-hint"}`}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive && tab.key === "likes" ? "currentColor" : "none"}
              />
              {count > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pass px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[var(--tg-secondary-bg-color)]">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </div>
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
