import { useEffect, useState } from 'react';
import {
  fetchShowDayInfo, fetchVenueSocials, fetchArtistBio, artistSocials,
  lookupVenueUrl, venueSearchUrl, venuePolicySearchUrl, appleMapsUrl,
  igSearchUrl, fetchShowWeather,
} from '../api';
import { track } from '../lib/analytics';

// The "Know Before You Go" panel — everything a fan needs on show day, shared
// verbatim by the day-of pop-up (KnowBeforeYouGo) and the ShowDetail show-day
// section. Self-contained: it does its own (module-cached) fetching, so both
// mount sites are cheap and neither threads props.
//
// Tiered so it is NEVER empty: a floor of always-resolvable actions (Directions,
// venue site, bag policy, "find on Instagram") builds from show.venue/city
// alone; the Ticketmaster fields (rules, parking, box office, showtime…) and the
// artist/venue Instagram links layer in only when they resolve. We can't fetch
// the venue's actual IG post (no API) — the IG links deep-link to the profile,
// where that post lives. See docs/initiatives/2026-07-15-know-before-you-go.md.
export default function ShowDayInfo({ show }) {
  const [info, setInfo] = useState(null);        // Ticketmaster blob
  const [weather, setWeather] = useState(null);
  const [venueUrl, setVenueUrl] = useState(show?.venueUrl || '');
  const [venueIG, setVenueIG] = useState('');    // verified handle URL, or ''
  const [artistIG, setArtistIG] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Reset before fetching. The fetchers skip falsy results (a null TM/weather
    // miss doesn't overwrite), so without this a re-target of the same component
    // instance to a different show — e.g. a push deep-link swapping the open
    // show without unmounting — would leave the previous show's showtime, rules,
    // status badge, and IG links on screen.
    setInfo(null);
    setWeather(null);
    setVenueIG('');
    setArtistIG('');
    setVenueUrl(show?.venueUrl || '');
    const set = (fn) => (v) => { if (!cancelled && v) fn(v); };

    Promise.allSettled([
      fetchShowDayInfo(show.artist, show.venue, show.date).then(set(setInfo)),
      fetchShowWeather(show.city, show.date).then(set(setWeather)),
      // Venue website: prefer the already-persisted URL, else resolve it.
      show?.venueUrl
        ? Promise.resolve()
        : lookupVenueUrl(show.venue, show.city).then(set(setVenueUrl)),
      fetchVenueSocials(show.venue, show.city).then(set((s) => setVenueIG(s.instagram))),
      fetchArtistBio(show.artist).then(set((bio) => setArtistIG(artistSocials(bio).instagram))),
    ]).then(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);

  const tap = (link) => track('showday_link_tapped', { link });
  const Link = ({ href, icon, children, name }) => (
    <a className="showday-link" href={href} target="_blank" rel="noopener noreferrer" onClick={() => tap(name)}>
      <span aria-hidden="true">{icon}</span> {children}
    </a>
  );
  // A labelled block of venue-authored free text. Rendered as TEXT (never HTML)
  // — these fields are inconsistent and occasionally carry raw markup.
  const InfoBlock = ({ icon, title, children }) => (
    <div className="showday-info">
      <div className="showday-info-title"><span aria-hidden="true">{icon}</span> {title}</div>
      <div className="showday-info-body">{children}</div>
    </div>
  );

  const site = venueUrl || venueSearchUrl(show.venue, show.city);
  const i = info || {};

  return (
    <>
      {/* Cancelled / postponed / rescheduled — pinned above everything, so a
          stale note never reads as if the show is on. */}
      {i.status && (
        <div className={`showday-status showday-status-${i.status}`}>
          {i.status === 'cancelled' ? '⚠️ This event is cancelled'
            : i.status === 'postponed' ? '⚠️ This event is postponed'
              : '⚠️ This event has been rescheduled'}
        </div>
      )}

      {loading ? (
        <div className="showday-chips">
          <div className="showday-chip showday-chip-skeleton" />
          <div className="showday-chip showday-chip-skeleton" />
        </div>
      ) : (i.startTime || weather) && (
        <div className="showday-chips">
          {i.startTime && (
            <div className="showday-chip">
              <span className="showday-chip-icon" aria-hidden="true">🕖</span>
              <span className="showday-chip-text"><b>{i.startTime}</b><small>show starts</small></span>
            </div>
          )}
          {weather && (
            <div className="showday-chip">
              <span className="showday-chip-icon" aria-hidden="true">{weather.emoji}</span>
              <span className="showday-chip-text">
                <b>{weather.hi}° / {weather.lo}°</b>
                <small>
                  {weather.label}
                  {weather.rainPct != null && weather.rainPct >= 20 ? ` · ${weather.rainPct}% rain` : ''}
                </small>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Floor actions — always resolvable from the show alone. Labels stay
          generic (the artist + venue are already in the card header) so they
          never overflow the pill. */}
      <div className="showday-links">
        <Link href={appleMapsUrl(show.venue, show.city)} icon="🧭" name="directions">Directions</Link>
        <Link href={site} icon="🌐" name="venue_site">Venue info</Link>
        <Link href={venuePolicySearchUrl(show.venue, show.city)} icon="🎒" name="venue_rules">Bag policy</Link>
        {/* Verified venue handle when we have one, else an honest search. */}
        <Link
          href={venueIG || igSearchUrl(`${show.venue} ${show.city || ''}`.trim())}
          icon="📸"
          name={venueIG ? 'venue_ig' : 'venue_ig_search'}
        >
          {venueIG ? 'Venue on Instagram' : 'Find on Instagram'}
        </Link>
        {artistIG && (
          <Link href={artistIG} icon="🎤" name="artist_ig">Artist on Instagram</Link>
        )}
      </div>

      {/* Ticketmaster detail — each block only when TM populated it. */}
      {i.venueRules && <InfoBlock icon="📋" title="Venue rules">{i.venueRules}</InfoBlock>}
      {i.agePolicy && <InfoBlock icon="🧒" title="Age policy">{i.agePolicy}</InfoBlock>}
      {i.parking && <InfoBlock icon="🅿️" title="Parking">{i.parking}</InfoBlock>}
      {i.boxOffice?.length > 0 && (
        <InfoBlock icon="🎫" title="Box office">
          {i.boxOffice.map((b) => (
            <div key={b.label} className="showday-info-line"><b>{b.label}:</b> {b.text}</div>
          ))}
        </InfoBlock>
      )}
      {i.accessibility && <InfoBlock icon="♿" title="Accessibility">{i.accessibility}</InfoBlock>}
      {i.ticketLimit && <InfoBlock icon="🔢" title="Ticket limit">{i.ticketLimit}</InfoBlock>}
      {i.notes?.map((n, idx) => (
        <InfoBlock key={idx} icon="📣" title="Good to know">{n}</InfoBlock>
      ))}

      {i.seatmapUrl && (
        <a className="showday-seatmap" href={i.seatmapUrl} target="_blank" rel="noopener noreferrer" onClick={() => tap('seatmap')}>
          {/* TM's staticUrl can 404 (stale) — hide the frame rather than show a
              broken-image glyph. */}
          <img
            src={i.seatmapUrl}
            alt="Seat map"
            loading="lazy"
            onError={(e) => { const a = e.currentTarget.closest('.showday-seatmap'); if (a) a.style.display = 'none'; }}
          />
        </a>
      )}

      {i.tmEventUrl && (
        <a className="showday-tm" href={i.tmEventUrl} target="_blank" rel="noopener noreferrer" onClick={() => tap('ticketmaster')}>
          Full event details on Ticketmaster ↗
        </a>
      )}
    </>
  );
}
