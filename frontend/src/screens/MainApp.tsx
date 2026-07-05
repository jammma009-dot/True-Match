import { useEffect, useState } from "react";
import { BottomNav, Tab } from "../components/BottomNav";
import { DiscoverScreen } from "./DiscoverScreen";
import { LikesScreen } from "./LikesScreen";
import { MatchesScreen } from "./MatchesScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";
import { MatchListItem } from "../lib/api";
import { api } from "../lib/api";
import { getSocket, disconnectSocket } from "../lib/socket";

/**
 * Main experience for APPROVED users: four tabs plus a full-screen chat view.
 * Manages presence (online/offline) so the backend knows whether to send a
 * bot notification for new messages.
 */
export function MainApp() {
  const [tab, setTab] = useState<Tab>("discover");
  const [activeChat, setActiveChat] = useState<MatchListItem | null>(null);

  // Connect socket + mark presence online while the app is open.
  useEffect(() => {
    getSocket();
    void api.setPresence(true).catch(() => undefined);

    const onHidden = () => {
      void api.setPresence(!document.hidden).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      void api.setPresence(false).catch(() => undefined);
      disconnectSocket();
    };
  }, []);

  // Full-screen chat takes over (its own back button returns here).
  if (activeChat) {
    return (
      <div className="h-full">
        <ChatScreen match={activeChat} onBack={() => setActiveChat(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {tab === "discover" && <DiscoverScreen />}
        {tab === "likes" && <LikesScreen />}
        {tab === "chats" && <MatchesScreen onOpenChat={setActiveChat} />}
        {tab === "profile" && <ProfileScreen />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
