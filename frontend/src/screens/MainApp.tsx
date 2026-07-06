import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav, Tab } from "../components/BottomNav";
import { DiscoverScreen } from "./DiscoverScreen";
import { LikesScreen } from "./LikesScreen";
import { MatchesScreen } from "./MatchesScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";
import { MatchModal } from "../components/MatchModal";
import { api, MatchListItem } from "../lib/api";
import { getSocket, disconnectSocket } from "../lib/socket";
import { haptics } from "../lib/telegram";

/**
 * Main experience for APPROVED users: four tabs plus a full-screen chat view.
 * Owns the live socket wiring: presence, new-match celebrations (both sides),
 * and unread-message badges.
 */
export function MainApp() {
  const [tab, setTab] = useState<Tab>("discover");
  const [activeChat, setActiveChat] = useState<MatchListItem | null>(null);
  const [incomingMatch, setIncomingMatch] = useState<MatchListItem | null>(null);
  const queryClient = useQueryClient();

  // Matches drive the unread badge on the Chats tab.
  const { data: matchesData } = useQuery({
    queryKey: ["matches"],
    queryFn: api.getMatches,
    refetchInterval: 20000,
  });
  // Badge = conversations needing attention: a brand-new (unseen) match OR one
  // with unread messages.
  const badgeCount =
    matchesData?.matches.filter((m) => m.seen === false || (m.unread ?? 0) > 0)
      .length ?? 0;

  // Track matches whose celebration we've already popped this session.
  const shownMatchIds = useRef<Set<string>>(new Set());

  // When matches load (e.g. on open), show the celebration for any match the
  // user hasn't seen yet — this covers matches that happened while they were
  // away (the real-time socket event was missed).
  useEffect(() => {
    if (incomingMatch) return;
    const unseen = matchesData?.matches.find(
      (m) => m.seen === false && !shownMatchIds.current.has(m.matchId),
    );
    if (unseen) {
      shownMatchIds.current.add(unseen.matchId);
      setIncomingMatch(unseen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesData, incomingMatch]);

  // Connect socket + presence + global listeners while the app is open.
  useEffect(() => {
    const socket = getSocket();
    void api.setPresence(true).catch(() => undefined);

    const onMatch = (payload: MatchListItem) => {
      haptics.notify("success");
      if (payload.matchId) shownMatchIds.current.add(payload.matchId);
      setIncomingMatch(payload);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    };
    const onMessage = () => {
      // Refresh matches so the unread badge + previews stay live.
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    };
    socket.on("match:new", onMatch);
    socket.on("message:new", onMessage);

    const onHidden = () => {
      void api.setPresence(!document.hidden).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      socket.off("match:new", onMatch);
      socket.off("message:new", onMessage);
      document.removeEventListener("visibilitychange", onHidden);
      void api.setPresence(false).catch(() => undefined);
      disconnectSocket();
    };
  }, [queryClient]);

  const closeChat = useCallback(() => {
    setActiveChat(null);
    queryClient.invalidateQueries({ queryKey: ["matches"] });
  }, [queryClient]);

  const openChat = useCallback((m: MatchListItem) => setActiveChat(m), []);

  const dismissMatch = useCallback(
    (openChat: boolean) => {
      const m = incomingMatch;
      setIncomingMatch(null);
      if (m?.matchId) {
        void api
          .markMatchSeen(m.matchId)
          .catch(() => undefined)
          .finally(() => queryClient.invalidateQueries({ queryKey: ["matches"] }));
      }
      if (openChat && m) setActiveChat(m);
    },
    [incomingMatch, queryClient],
  );

  const matchModal = incomingMatch ? (
    <MatchModal
      match={incomingMatch}
      onSendMessage={() => dismissMatch(true)}
      onKeepSwiping={() => dismissMatch(false)}
    />
  ) : null;

  // Full-screen chat takes over (its own back button returns here).
  if (activeChat) {
    return (
      <div className="h-full">
        <ChatScreen match={activeChat} onBack={closeChat} />
        {matchModal}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="relative min-h-0 flex-1">
        {/* Discover fills the screen with no scrolling; other tabs scroll. */}
        {tab === "discover" && <DiscoverScreen onMatch={setIncomingMatch} />}
        {tab === "likes" && (
          <div className="h-full overflow-y-auto">
            <LikesScreen />
          </div>
        )}
        {tab === "chats" && (
          <div className="h-full overflow-y-auto">
            <MatchesScreen onOpenChat={openChat} />
          </div>
        )}
        {tab === "profile" && (
          <div className="h-full overflow-y-auto">
            <ProfileScreen />
          </div>
        )}
      </main>
      <BottomNav
        active={tab}
        onChange={setTab}
        badges={{ chats: badgeCount }}
      />
      {matchModal}
    </div>
  );
}
