import { useEffect, useMemo, useState } from 'react';
import { TEAMS } from '../data/teams';
import { isDebugMode, withNoCache } from '../utils/debug';

const TEAM_OPTIONS = [
  { value: 'all', label: 'すべて' },
  ...Object.keys(TEAMS).map(team => ({ value: team, label: team })),
];

const SORT_OPTIONS = [
  { value: 'momentum', label: '勢い順' },
  { value: 'responses', label: 'レス数順' },
  { value: 'recent', label: '掲載順' },
  { value: 'board', label: '板別' },
];

function formatTimestamp(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('ja-JP');
}

function formatSpeed(value) {
  if (!Number.isFinite(value)) return '-';
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

function formatSummaryCredit(summary) {
  const at = new Date(summary.generatedAt).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${summary.model} / ${at}`;
}

function ThreadCard({ thread, summary }) {
  return (
    <article className="thread-card">
      <div className="thread-card-header">
        <span className="thread-board">{thread.boardLabel}</span>
        <span className="thread-count">
          {thread.responseCount}レス
          {thread.delta > 0 && <span className="thread-delta">+{thread.delta}</span>}
        </span>
      </div>
      <div className="thread-metrics">
        <span>勢い {formatSpeed(thread.speedPerHour)}レス/時</span>
        <span>掲載 {thread.subjectRank}位</span>
      </div>
      <h3 className="thread-title">{thread.title}</h3>
      {!!thread.matchedTeams?.length && (
        <div className="thread-tags">
          {thread.matchedTeams.map(team => (
            <span key={team} className="thread-tag">{team}</span>
          ))}
        </div>
      )}
      {summary && (
        <p className="thread-summary">
          <span className="thread-summary-label">AI要約</span>
          {summary.content}
          <span className="thread-summary-credit">（{formatSummaryCredit(summary)}）</span>
        </p>
      )}
      <a className="thread-link" href={thread.url} target="_blank" rel="noreferrer">
        5chで開く
      </a>
    </article>
  );
}

export default function Threads() {
  const [team, setTeam] = useState('all');
  const [sort, setSort] = useState('momentum');
  const [data, setData] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const debugMode = isDebugMode();

  const apiPath = useMemo(() => {
    const params = new URLSearchParams({ team, sort, limit: '24' });
    if (debugMode) params.set('nocache', '1');
    return `/api/threads?${params.toString()}`;
  }, [team, sort, debugMode]);

  const refresh = () => {
    setError(null);
    setData(null);
    setRefreshToken(value => value + 1);
  };

  useEffect(() => {
    if (data) return;
    setLoading(true);
    setError(null);
    fetch(withNoCache(apiPath), { cache: debugMode ? 'no-store' : 'default' })
      .then(r => {
        if (!r.ok) throw new Error(`threads ${r.status}`);
        return r.json();
      })
      .then(json => setData(json))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiPath, data, debugMode, refreshToken]);

  // 勢い上位スレの AI 要約（key = スレID）を一括取得。無ければ空のまま。
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai/comments/threads?year=${new Date().getFullYear()}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled) setSummaries(json.comments ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <section className="section">
      <h2 className="section-title">関連スレッド</h2>
      <div className="controls-row">
        <select
          className="control-select"
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setData(null);
          }}
        >
          {TEAM_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="control-select"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setData(null);
          }}
        >
          {SORT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button type="button" className="control-button" onClick={refresh} disabled={loading}>
          更新
        </button>
      </div>

      <p className="threads-note">
        勢いは前回取得時から増えたレス数を時間あたりに換算した近似値です。レス本文は転載しません（「AI要約」は勢い上位スレのレス抜粋からAIが自動生成したものです）。
      </p>

      {loading && <div className="status-msg">読み込み中...</div>}
      {error && (
        <div className="error-msg">
          <strong>取得エラー:</strong> {error}
        </div>
      )}
      {!loading && !error && data && (
        <>
          {!!data.errors?.length && (
            <div className="status-msg">
              一部の板を取得できませんでした。
            </div>
          )}
          {data.threads?.length ? (
            <div className="thread-grid">
              {data.threads.map(thread => (
                <ThreadCard key={thread.id} thread={thread} summary={summaries[thread.id]} />
              ))}
            </div>
          ) : (
            <div className="status-msg">関連スレッドは見つかりませんでした。</div>
          )}
          <div className="threads-updated">
            取得日時: {formatTimestamp(data.generatedAt)}
          </div>
        </>
      )}
    </section>
  );
}
