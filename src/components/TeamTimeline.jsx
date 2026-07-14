import { useEffect, useRef, useState } from 'react';
import { getContrastColor, getTeamBySlug } from '../data/teams';
import TeamHeadToHead from './TeamHeadToHead';

// チーム別のX公式リスト。作成済みのチームだけ関連ポスト欄を表示する。
const X_LIST_URLS = {
  hanshin: 'https://x.com/kusanagiturugi/lists/2063091274643886176',
  dena: 'https://x.com/i/lists/2063100139192111548',
};
const X_WIDGETS_URL = 'https://platform.x.com/widgets.js';

function waitForXWidgets(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.twttr?.widgets) {
        window.clearInterval(timer);
        resolve(window.twttr);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('X widgets API did not become ready'));
      }
    }, 50);
  });
}

function loadXWidgets() {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${X_WIDGETS_URL}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        waitForXWidgets().then(resolve, reject);
        return;
      }
      existing.addEventListener('load', () => waitForXWidgets().then(resolve, reject), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = X_WIDGETS_URL;
    script.async = true;
    script.charset = 'utf-8';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      waitForXWidgets().then(resolve, reject);
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

export default function TeamTimeline({ teamSlug, dark }) {
  const timelineRef = useRef(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const team = getTeamBySlug(teamSlug);
  const listUrl = X_LIST_URLS[teamSlug];

  useEffect(() => {
    if (!listUrl) return undefined;
    let cancelled = false;
    let timeoutId;
    let observer;

    const timelineVisible = () => {
      const iframe = timelineRef.current?.querySelector('iframe[title="Twitter Timeline"]');
      return iframe && iframe.offsetHeight > 0 && iframe.style.visibility !== 'hidden';
    };

    const watchTimeline = () => {
      if (!timelineRef.current) return;

      observer = new MutationObserver(() => {
        if (timelineVisible()) {
          setLoadFailed(false);
          window.clearTimeout(timeoutId);
          observer?.disconnect();
        }
      });
      observer.observe(timelineRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });

      timeoutId = window.setTimeout(() => {
        if (!cancelled && !timelineVisible()) setLoadFailed(true);
      }, 12000);
    };

    loadXWidgets()
      .then(twttr => {
        if (cancelled || !timelineRef.current || !twttr?.widgets) return;
        watchTimeline();
        return twttr.widgets.load(timelineRef.current);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      observer?.disconnect();
    };
  }, [dark, listUrl]);

  if (!team) return null;
  const teamColor = team.colors[0];

  return (
    <section className="section team-page">
      <div className="team-page-heading">
        <span
          className="team-page-badge"
          style={{ background: teamColor, color: getContrastColor(teamColor) }}
        >
          {team.code}
        </span>
        <div>
          <h2 className="section-title">{team.official}</h2>
          <p className="team-page-subtitle">チーム情報</p>
        </div>
      </div>

      <TeamHeadToHead teamName={team.shortName} year={new Date().getFullYear()} />

      {listUrl && (
        <>
          <h3 className="team-page-block-title">関連ポスト</h3>
          <div className="team-timeline" ref={timelineRef}>
            <a
              className="twitter-timeline"
              data-height="760"
              data-theme={dark ? 'dark' : 'light'}
              data-chrome="noheader nofooter"
              href={listUrl}
            >
              {team.shortName}関連ポストをXで見る
            </a>
          </div>

          {loadFailed && (
            <div className="status-msg">
              Xの埋め込みを読み込めませんでした。{' '}
              <a href={listUrl} target="_blank" rel="noreferrer">
                Xでリストを開く
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
