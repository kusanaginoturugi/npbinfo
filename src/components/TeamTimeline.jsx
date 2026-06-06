import { useEffect, useRef, useState } from 'react';
import { getContrastColor, getTeamInfo } from '../data/teams';

const TIGERS_LIST_URL = 'https://x.com/kusanagiturugi/lists/2063091274643886176';
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

export default function TeamTimeline({ dark }) {
  const timelineRef = useRef(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const team = getTeamInfo('阪神');
  const teamColor = team.colors[0];

  useEffect(() => {
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
  }, [dark]);

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
          <p className="team-page-subtitle">阪神関連ポスト</p>
        </div>
      </div>

      <div className="team-timeline" ref={timelineRef}>
        <a
          className="twitter-timeline"
          data-height="760"
          data-theme={dark ? 'dark' : 'light'}
          data-chrome="noheader nofooter"
          href={TIGERS_LIST_URL}
        >
          阪神関連ポストをXで見る
        </a>
      </div>

      {loadFailed && (
        <div className="status-msg">
          Xの埋め込みを読み込めませんでした。{' '}
          <a href={TIGERS_LIST_URL} target="_blank" rel="noreferrer">
            Xでリストを開く
          </a>
        </div>
      )}
    </section>
  );
}
