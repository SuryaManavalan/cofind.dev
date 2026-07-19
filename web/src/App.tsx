import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "./types";
import { api } from "./api";
import { FeedProvider } from "./feed-context";
import AuthScreen from "./components/AuthScreen";
import Layout from "./components/Layout";
import FeedView from "./views/FeedView";
import GalleryView from "./views/GalleryView";
import GraphView from "./views/GraphView";
import FloorView from "./views/FloorView";
import ProfileView from "./views/ProfileView";
import TrackView from "./views/TrackView";
import TracksView from "./views/TracksView";
import ThreadView from "./views/ThreadView";

// The feed stays mounted underneath the thread overlay, so going "back" from a
// thread returns to the exact scroll position — Twitter-style navigation.
function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  const panel =
    location.pathname.startsWith("/post/") || location.pathname.startsWith("/u/") || location.pathname.startsWith("/t/") ? (
      <Routes>
        <Route path="/post/:id" element={<ThreadView />} />
        <Route path="/u/:handle" element={<ProfileView />} />
        <Route path="/t/:slug" element={<TrackView />} />
        <Route path="/t/:ns/:slug" element={<TrackView />} />
      </Routes>
    ) : null;
  return (
    <FeedProvider user={user}>
      <Layout user={user} onLogout={onLogout} panel={panel}>
        {location.pathname === "/gallery" ? <GalleryView /> : location.pathname === "/tracks" ? <TracksView /> : location.pathname === "/graph" ? <GraphView /> : location.pathname === "/floor" ? <FloorView /> : <FeedView />}
      </Layout>
    </FeedProvider>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
  }

  if (!authChecked) return null;
  if (!user) return <AuthScreen onAuthed={setUser} />;

  return (
    <BrowserRouter>
      <Shell user={user} onLogout={logout} />
    </BrowserRouter>
  );
}
