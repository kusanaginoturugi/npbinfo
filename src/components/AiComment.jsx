import { useEffect, useState } from 'react';
import { getTeamBySlug } from '../data/teams';

// D1 に保存済みの AI コメントを表示する汎用コンポーネント。
// subjectType/subjectKey は worker/index.js の /api/ai/comments/:type/:key に対応。
// showPersona を立てると担当キャラ（12球団キャラからランダム起用）を表示する。
// subjectKey が動的に変わる場所では key={subjectKey} を渡して remount させること。
export default function AiComment({
  subjectType,
  subjectKey,
  year,
  title,
  titleClassName,
  showPersona = false,
  note = '成績データからAIが自動生成したコメントです',
}) {
  const [comment, setComment] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const query = year ? `?year=${year}` : '';
    fetch(`/api/ai/comments/${subjectType}/${subjectKey}${query}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled) setComment(json.comment ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subjectType, subjectKey, year]);

  if (!comment) return null;

  const generatedDate = new Date(comment.generatedAt).toLocaleDateString('ja-JP');
  const personaTeam = showPersona && comment.persona ? getTeamBySlug(comment.persona) : null;

  return (
    <>
      {title && <h3 className={titleClassName}>{title}</h3>}
      <div className="ai-comment-card">
        {personaTeam && (
          <p className="ai-comment-persona">
            本日の担当:
            <span className="team-color-dot" style={{ background: personaTeam.colors?.[0] ?? '#555' }} />
            {personaTeam.shortName}担当
          </p>
        )}
        <p className="ai-comment-text">{comment.content}</p>
        <p className="ai-comment-note">
          {note}（{comment.model} / {generatedDate}）。
        </p>
      </div>
    </>
  );
}
