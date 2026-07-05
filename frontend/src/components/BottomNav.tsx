import { useT } from "../store/useStore";
import { haptics } from "../lib/telegram";

export type Tab = "discover" | "likes" | "chats" | "profile";

const TABS: { key: Tab; icon: string; labelKey: string }[] = [
  { key: "discover", icon: "🔥", labelKey: "nav.discover" },
  { key: "likes", icon: "❤️", labelKey: "nav.likes" },
  { key: "chats", icon: "💬", labelKey: "nav.chats" },
  { key: "profile", icon: "👤", labelKey: "nav.profile" },
];

/**
 * Bottom tab bar. When `disabled` (e.g. pending/rejected state) the tabs are
 * visible but dimmed and non-interactive.
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
      className={`sticky bottom-0 flex border-t border-white/5 bg-[var(--tg-secondary-bg-color)] ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active && !disabled;
        return (
          <button
            key={tab.key}
            onClick={() => {
              if (disabled) return;
              haptics.select();
              onChange(tab.key);
            }}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
          >
            <span className={`text-xl ${isActive ? "" : "grayscale"}`}>
              {tab.icon}
            </span>
            <span
              className={`text-[11px] ${isActive ? "text-brand" : "text-tg-hint"}`}
            >
              {t(tab.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
