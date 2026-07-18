import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "./types";
import { api } from "./api";
import { FeedProvider } from "./feed-context";
import AuthScreen from "./components/AuthScreen";
import Layout from "./components/Layout";
import FeedView from "./views/FeedView";
import ThreadView from "./views/ThreadView";

// The feed stays mounted underneath the thread overlay, so going "back" from a
// thread returns to the exact scroll position — Twitter-style navigation.
function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  return (
    <FeedProvider user={user}>
      <Layout user={user} onLogout={onLogout}>
        <FeedView />
        {location.pathname.startsWith("/post/") && (
          <Routes>
            <Route path="/post/:id" element={<ThreadView />} />
          </Routes>
        )}
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
