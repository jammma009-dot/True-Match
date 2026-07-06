import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./lib/api";
import { getInitData } from "./lib/telegram";
import { useStore, useT } from "./store/useStore";
import { FullScreen } from "./components/ui";
import { LoadingScreen } from "./components/LoadingScreen";
import { OnboardingWizard } from "./screens/onboarding/OnboardingWizard";
import { PendingScreen, RejectedScreen } from "./screens/StatusScreens";
import { MainApp } from "./screens/MainApp";

export default function App() {
  const t = useT();
  const setMe = useStore((s) => s.setMe);
  const hasInitData = Boolean(getInitData());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: hasInitData,
    // While the profile is under review, poll so approval/rejection reflects
    // automatically without the user having to close & reopen the app.
    refetchInterval: (query) =>
      query.state.data?.profile?.status === "pending" ? 5000 : false,
  });

  useEffect(() => {
    if (data) setMe(data);
  }, [data, setMe]);

  // Not running inside Telegram (no initData available).
  if (!hasInitData) {
    return (
      <FullScreen>
        <img
          src="/logo-wordmark.png"
          alt="True Match"
          className="mb-6 w-56 max-w-[75%] object-contain"
        />
        <p className="text-tg-hint">{t("error.notInTelegram")}</p>
      </FullScreen>
    );
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isError) {
    const banned = error instanceof ApiError && error.code === "banned";
    return (
      <FullScreen>
        <div className="mb-4 text-5xl">{banned ? "🚫" : "⚠️"}</div>
        <p className="text-tg-hint">{t("error.auth")}</p>
      </FullScreen>
    );
  }

  const profile = data?.profile ?? null;

  // Route based on profile state.
  if (!profile) return <OnboardingWizard />;
  if (profile.status === "pending") return <PendingScreen />;
  if (profile.status === "rejected") return <RejectedScreen />;
  return <MainApp />;
}
