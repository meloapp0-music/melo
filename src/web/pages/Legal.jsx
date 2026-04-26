import { useState } from 'react';
import { useApp } from '../App';

// Single page housing Attributions, Privacy Policy, and Terms of
// Service. All three are required for App Store submission and for
// honoring the third-party API ToS we depend on (Ticketmaster,
// Setlist.fm, Apple Music previews, MusicBrainz, Deezer).
//
// IMPORTANT: The Privacy Policy and Terms of Service text below is a
// developer-drafted starting point modeled on common patterns. It is
// NOT legal advice and MUST be reviewed by an attorney before public
// launch. Update `LEGAL_LAST_UPDATED` and `LEGAL_CONTACT_EMAIL` in
// this file when you finalize them.
const LEGAL_LAST_UPDATED = '2026-04-20';
const LEGAL_CONTACT_EMAIL = 'support@melo.app';

const TABS = [
  { id: 'attributions', label: 'Attributions' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'terms', label: 'Terms' },
];

export default function Legal() {
  const { navigate } = useApp();
  const [tab, setTab] = useState('attributions');

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('settings')}>
        <svg viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Settings
      </button>
      <h1>Legal</h1>

      <div className="shows-tabs" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`shows-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'attributions' && <Attributions />}
      {tab === 'privacy' && <Privacy />}
      {tab === 'terms' && <Terms />}

      <div style={{ height: 24 }} />
    </div>
  );
}

function Attributions() {
  return (
    <div className="legal-section fade-in">
      <p className="legal-lead">
        Melo couldn't exist without the open data and developer
        platforms below. We're grateful — and we're legally required to
        say so.
      </p>

      <Source
        name="Ticketmaster Discovery API"
        purpose="Upcoming concert and festival listings, including links to purchase tickets."
        license="Used under the Ticketmaster Developer Terms of Use."
        href="https://developer.ticketmaster.com/support/terms-of-use/"
      />
      <Source
        name="Setlist.fm API"
        purpose="Real concert setlists. You connect your own free Setlist.fm API key."
        license={
          <>Setlist data is community-contributed and licensed under{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">
              CC BY-SA 4.0
            </a>.
          </>
        }
        href="https://api.setlist.fm/docs/1.0/index.html"
      />
      <Source
        name="Apple Music / iTunes Search API"
        purpose="30-second song previews and Apple Music deep links."
        license="Used under Apple's iTunes Affiliate / Search API terms."
        href="https://performance-partners.apple.com/search-api"
      />
      <Source
        name="MusicBrainz"
        purpose="Artist biographies, genres, and band metadata."
        license={
          <>Open Database License (ODbL). Powered by{' '}
            <a href="https://musicbrainz.org" target="_blank" rel="noopener">
              MusicBrainz
            </a>.
          </>
        }
        href="https://musicbrainz.org/doc/About"
      />
      <Source
        name="Deezer API"
        purpose="Canonical artist names and artist images (displayed only as artist thumbnails in-app)."
        license="Used under the Deezer API Terms of Use."
        href="https://developers.deezer.com/api/terms"
      />
      <Source
        name="Spotify"
        purpose="Search deep-links only — Melo does not query the Spotify API."
        license="Linking out to Spotify search URLs requires no integration agreement."
        href="https://developer.spotify.com/policy"
      />
      <Source
        name="OpenStreetMap & CARTO"
        purpose="Map tiles for the Concert Map."
        license={
          <>Tiles &copy;{' '}
            <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>,
            data &copy;{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
              OpenStreetMap contributors
            </a>.
          </>
        }
        href="https://www.openstreetmap.org/copyright"
      />
      <Source
        name="Leaflet"
        purpose="Interactive map library."
        license="BSD-2-Clause."
        href="https://leafletjs.com"
      />

      <p className="legal-meta">Last updated {LEGAL_LAST_UPDATED}.</p>
    </div>
  );
}

function Source({ name, purpose, license, href }) {
  return (
    <div className="legal-source">
      <div className="legal-source-name">
        <a href={href} target="_blank" rel="noopener">{name}</a>
      </div>
      <div className="legal-source-purpose">{purpose}</div>
      <div className="legal-source-license">{license}</div>
    </div>
  );
}

function Privacy() {
  return (
    <div className="legal-section fade-in">
      <p className="legal-draft-note">
        <strong>Draft — pending legal review.</strong> The text below is
        a developer-drafted starting point for App Store submission and
        does not constitute legal advice.
      </p>

      <h3>What we collect</h3>
      <p>
        When you create an account, we collect the email address you
        sign up with and a username you choose. As you use Melo, we
        store the concerts you log (artist, date, venue, city, your
        score, vibes, notes, and setlist), your friends list, and your
        app settings. All of this is yours.
      </p>

      <h3>What we don't collect</h3>
      <p>
        We don't sell your data. We don't run ad tracking. We don't ask
        for location, contacts, microphone, camera, or motion data. We
        do not collect analytics about how you use the app beyond
        anonymized error logs.
      </p>

      <h3>Where it lives</h3>
      <p>
        Your data is stored in Supabase (PostgreSQL hosted on AWS) under
        Row-Level Security policies that prevent any other user from
        reading it. Your Setlist.fm API key, if you provide one, is
        stored encrypted at rest in that same database.
      </p>

      <h3>Third parties we contact on your behalf</h3>
      <p>
        When you log a show, search for an artist, or browse upcoming
        concerts, Melo queries the public APIs listed in the
        Attributions tab. These services see only the artist names,
        cities, or song titles you ask about — never your email,
        username, or friend list. The exception is Setlist.fm: when you
        connect your own API key, those requests are authenticated as
        you.
      </p>

      <h3>Account deletion</h3>
      <p>
        You can delete your account from Settings → Account → Delete
        Account. This permanently removes your profile, every show
        you've logged, your rankings, your settings, and your auth
        record. The action cannot be undone.
      </p>

      <h3>Children</h3>
      <p>
        Melo is not directed at children under 13 and we do not
        knowingly collect data from them.
      </p>

      <h3>Changes</h3>
      <p>
        If we change this policy, we'll bump the date below and (for
        material changes) notify you in the app on next launch.
      </p>

      <h3>Contact</h3>
      <p>
        Questions about your data? Email{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>

      <p className="legal-meta">Last updated {LEGAL_LAST_UPDATED}.</p>
    </div>
  );
}

function Terms() {
  return (
    <div className="legal-section fade-in">
      <p className="legal-draft-note">
        <strong>Draft — pending legal review.</strong> The text below is
        a developer-drafted starting point for App Store submission and
        does not constitute legal advice.
      </p>

      <h3>1. Use of the service</h3>
      <p>
        Melo is a personal concert-tracking app. By creating an account,
        you agree to use it only for that purpose and to follow the
        rules of every third-party service it connects to (Ticketmaster,
        Setlist.fm, Apple Music, Deezer, MusicBrainz). You are
        responsible for the content you log — keep it accurate, keep it
        yours, and don't post anything illegal, hateful, or that
        infringes someone else's rights.
      </p>

      <h3>2. Your content</h3>
      <p>
        The shows, scores, vibes, notes, and friends you create stay
        yours. By using Melo's social features, you grant us a limited
        license to display that content to the friends and audiences
        you choose. You can delete any show — or your entire account —
        at any time.
      </p>

      <h3>3. Third-party content</h3>
      <p>
        Setlists, lineup data, artist bios, song previews, and ticket
        listings come from the partners listed in the Attributions tab
        and are subject to their respective terms. Melo does not own
        this data and cannot guarantee it is accurate or current.
      </p>

      <h3>4. Tickets and purchases</h3>
      <p>
        When you tap "Tickets" on an event in Melo, you leave the app
        and complete the purchase on Ticketmaster's site. Melo is not a
        ticket seller and is not responsible for any ticketing
        transaction, refund, or dispute.
      </p>

      <h3>5. No warranty</h3>
      <p>
        Melo is provided "as is." We do our best to keep it running and
        accurate, but we don't warrant uninterrupted service or perfect
        data. To the maximum extent allowed by law, we disclaim all
        warranties.
      </p>

      <h3>6. Limitation of liability</h3>
      <p>
        To the maximum extent allowed by law, Melo and its operators
        are not liable for indirect, incidental, or consequential
        damages arising from your use of the service.
      </p>

      <h3>7. Termination</h3>
      <p>
        You may stop using Melo and delete your account at any time. We
        may suspend or terminate accounts that violate these terms.
      </p>

      <h3>8. Changes</h3>
      <p>
        We may update these terms from time to time. Continued use of
        Melo after a change constitutes acceptance of the new terms.
      </p>

      <h3>9. Contact</h3>
      <p>
        Questions? Email{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>

      <p className="legal-meta">Last updated {LEGAL_LAST_UPDATED}.</p>
    </div>
  );
}
