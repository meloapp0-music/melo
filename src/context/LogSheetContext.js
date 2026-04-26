import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import LogShowSheet from '../components/LogShowSheet';
import { useShows } from './ShowsContext';

const LogSheetContext = createContext(null);

const INITIAL_SHEET = {
  editingId: null,
  initialShow: null,
  open: false,
  wishlistEdit: false,
};

export function LogSheetProvider({ children }) {
  const { handleLogSave } = useShows();
  const [sheet, setSheet] = useState(INITIAL_SHEET);

  const openLog = useCallback(() => {
    setSheet({
      editingId: null,
      initialShow: null,
      open: true,
      wishlistEdit: false,
    });
  }, []);

  const openLogEdit = useCallback((payload) => {
    setSheet({
      editingId: payload?.id ?? null,
      initialShow: payload?.show ?? null,
      open: true,
      wishlistEdit: Boolean(payload?.wishlist),
    });
  }, []);

  const closeLog = useCallback(() => {
    setSheet(INITIAL_SHEET);
  }, []);

  const value = useMemo(
    () => ({ closeLog, openLog, openLogEdit }),
    [closeLog, openLog, openLogEdit],
  );

  return (
    <LogSheetContext.Provider value={value}>
      {children}
      <LogShowSheet
        editingId={sheet.editingId}
        initialShow={sheet.initialShow}
        onClose={closeLog}
        onSave={handleLogSave}
        visible={sheet.open}
        wishlistEdit={sheet.wishlistEdit}
      />
    </LogSheetContext.Provider>
  );
}

export function useLogSheet() {
  const ctx = useContext(LogSheetContext);
  if (!ctx) {
    throw new Error('useLogSheet must be used within LogSheetProvider');
  }
  return ctx;
}
