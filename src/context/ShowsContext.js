import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  LIBRARY_ATTENDED_SEED,
  LIBRARY_WISHLIST_SEED,
} from '../data/librarySeed';
import { applyEloWin } from '../utils/elo';
import { showFromLogPayload } from '../utils/showPayload';
import { matchesWishlistEntry } from '../utils/wishlistMatch';

const ShowsContext = createContext(null);

export function ShowsProvider({ children }) {
  const [attended, setAttended] = useState(LIBRARY_ATTENDED_SEED);
  const [wishlist, setWishlist] = useState(LIBRARY_WISHLIST_SEED);
  const [eloById, setEloById] = useState({});
  const [battlesMeta, setBattlesMeta] = useState(() => ({
    count: 0,
    date: new Date().toDateString(),
  }));

  const addAttendedFromPayload = useCallback((payload) => {
    const show = showFromLogPayload(payload, null);
    setAttended((prev) => [show, ...prev]);
  }, []);

  const updateAttended = useCallback((id, payload) => {
    setAttended((prev) =>
      prev.map((s) =>
        s.id === id ? showFromLogPayload(payload, s) : s,
      ),
    );
  }, []);

  const updateWishlist = useCallback((id, payload) => {
    setWishlist((prev) =>
      prev.map((s) =>
        s.id === id ? showFromLogPayload({ ...payload, score: null }, s) : s,
      ),
    );
  }, []);

  const promoteWishlistToAttended = useCallback((id, payload) => {
    if (payload.score == null) {
      return;
    }
    setWishlist((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (!existing) {
        return prev;
      }
      const show = showFromLogPayload(payload, existing);
      setAttended((a) => [show, ...a]);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const deleteAttended = useCallback((id) => {
    setAttended((prev) => prev.filter((s) => s.id !== id));
    setEloById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const recordBattle = useCallback((winnerId, loserId) => {
    const today = new Date().toDateString();
    setBattlesMeta((m) => ({
      count: m.date === today ? m.count + 1 : 1,
      date: today,
    }));
    setEloById((prev) => {
      const ra = prev[winnerId] ?? 1500;
      const rb = prev[loserId] ?? 1500;
      const { newLoser, newWinner } = applyEloWin(ra, rb);
      return {
        ...prev,
        [loserId]: newLoser,
        [winnerId]: newWinner,
      };
    });
  }, []);

  const rankedAttended = useMemo(() => {
    return [...attended].sort((a, b) => {
      const ea = eloById[a.id] ?? 1500;
      const eb = eloById[b.id] ?? 1500;
      if (eb !== ea) {
        return eb - ea;
      }
      return a.artist.localeCompare(b.artist);
    });
  }, [attended, eloById]);

  const deleteWishlist = useCallback((id) => {
    setWishlist((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** Adds a wishlist show from a partial payload (e.g. Bandsintown). Returns whether a new row was added. */
  const addWishlistFromPayload = useCallback((payload) => {
    let added = false;
    setWishlist((prev) => {
      if (prev.some((w) => matchesWishlistEntry(w, payload))) {
        return prev;
      }
      added = true;
      const show = showFromLogPayload(
        {
          ...payload,
          score: null,
        },
        null,
      );
      return [show, ...prev];
    });
    return added;
  }, []);

  const handleLogSave = useCallback(
    (payload) => {
      const { editingId, wishlistEdit = false, ...rest } = payload;
      if (editingId) {
        if (wishlistEdit) {
          if (rest.score != null) {
            promoteWishlistToAttended(editingId, rest);
          } else {
            updateWishlist(editingId, rest);
          }
        } else {
          updateAttended(editingId, rest);
        }
      } else {
        addAttendedFromPayload(rest);
      }
    },
    [
      addAttendedFromPayload,
      promoteWishlistToAttended,
      updateAttended,
      updateWishlist,
    ],
  );

  const value = useMemo(
    () => ({
      addAttendedFromPayload,
      addWishlistFromPayload,
      attended,
      battlesToday: battlesMeta.count,
      deleteAttended,
      deleteWishlist,
      eloById,
      handleLogSave,
      promoteWishlistToAttended,
      rankedAttended,
      recordBattle,
      updateAttended,
      updateWishlist,
      wishlist,
    }),
    [
      addAttendedFromPayload,
      addWishlistFromPayload,
      attended,
      battlesMeta.count,
      deleteAttended,
      deleteWishlist,
      eloById,
      handleLogSave,
      promoteWishlistToAttended,
      rankedAttended,
      recordBattle,
      updateAttended,
      updateWishlist,
      wishlist,
    ],
  );

  return (
    <ShowsContext.Provider value={value}>{children}</ShowsContext.Provider>
  );
}

export function useShows() {
  const ctx = useContext(ShowsContext);
  if (!ctx) {
    throw new Error('useShows must be used within ShowsProvider');
  }
  return ctx;
}
