/** Same calendar day (local), same artist + venue (case-insensitive). */
export function matchesWishlistEntry(wishlistShow, payload) {
  const a = (wishlistShow.artist || '').trim().toLowerCase();
  const b = (payload.artist || '').trim().toLowerCase();
  if (a !== b) {
    return false;
  }
  const va = (wishlistShow.venue || '').trim().toLowerCase();
  const vb = (payload.venue || '').trim().toLowerCase();
  if (va !== vb) {
    return false;
  }
  const da = new Date(wishlistShow.date);
  const db = new Date(payload.date);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) {
    return false;
  }
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
