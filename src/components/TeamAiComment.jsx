import { useEffect, useState } from 'react';

export default function TeamAiComment({ teamSlug }) {
  const [comment, setComment] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai/comments/team/${teamSlug}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled) setComment(json.comment ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [teamSlug]);

  if (!comment) return null;

  const generatedDate = new Date(comment.generatedAt).toLocaleDateString('ja-JP');

  return (
    <>
      <h3 className="team-page-block-title">AIコメント</h3>
      <div className="ai-comment-card">
        <p className="ai-comment-text">{comment.content}</p>
        <p className="ai-comment-note">
          成績データからAIが自動生成したコメントです（{comment.model} / {generatedDate}）。
        </p>
      </div>
    </>
  );
}
