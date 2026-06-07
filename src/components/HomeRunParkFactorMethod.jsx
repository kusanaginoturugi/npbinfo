export default function HomeRunParkFactorMethod({ onBack }) {
  return (
    <section className="section methodology-page">
      <div className="methodology-heading">
        <h2 className="section-title">本塁打の球場補正について</h2>
        <button type="button" className="methodology-back" onClick={onBack}>
          順位表へ戻る
        </button>
      </div>

      <p className="methodology-lead">
        この補正値はNPB公式記録ではなく、球場ごとの本塁打の出やすさを比較するための独自推定です。
        順位や勝敗の算出には使用していません。
      </p>

      <h3>データ</h3>
      <ul>
        <li>対象は2023〜2025年のNPB一軍公式戦・セ・パ交流戦、計2,598試合です。</li>
        <li>NPB公式の試合日程・試合詳細から、開催球場、主催球団、両軍の本塁打数を取得しています。</li>
        <li>ファーム、クライマックスシリーズ、日本シリーズは対象外です。</li>
      </ul>

      <h3>球場係数</h3>
      <ol>
        <li>球場ごとに「その球場で両軍が打った本塁打数 ÷ 試合数」を求めます。</li>
        <li>主催球団ごとに「ビジター試合で両軍が打った本塁打数 ÷ 試合数」を求めます。</li>
        <li>球場の本塁打率を、主催球団のビジター本塁打率で割ります。</li>
        <li>少試合の極端な値を抑えるため、60試合分を係数1.000として平均へ回帰させます。</li>
        <li>全対象球場の試合数加重平均が1.000になるよう正規化します。</li>
      </ol>

      <div className="methodology-formula">
        <code>補正本塁打 = Σ（各試合の本塁打 ÷ 開催球場の係数）</code>
      </div>
      <p>
        係数が1.200の球場での1本は約0.83本、係数が0.800の球場での1本は1.25本として換算します。
        表では実際の本塁打数を残し、括弧内とグラフだけに補正値を使います。
      </p>

      <h3>2026年の例外</h3>
      <p>
        バンテリンドーム ナゴヤは2026年にホームランウイングが新設され、過去3年と球場条件が
        連続しません。そのため2026年は係数を1.000とし、補正対象から外しています。
        2026年の実績が揃った後に再評価します。
      </p>

      <h3>注意点</h3>
      <p>
        打者・投手の構成、気象、ボール、試合展開などは分離していません。
        また地方球場は試合数が少ないため、平均への回帰を強く受けます。
        選手評価や将来予測ではなく、チーム本塁打数を球場環境込みで眺めるための参考値です。
      </p>

      <h3>出典・確認</h3>
      <ul className="methodology-sources">
        <li>
          <a href="https://npb.jp/games/2025/" target="_blank" rel="noreferrer">
            NPB.jp 2025年試合日程・結果
          </a>
        </li>
        <li>
          <a
            href="https://dragons.jp/nagoyadome/facilities/wheelchair-hrwing.html"
            target="_blank"
            rel="noreferrer"
          >
            中日ドラゴンズ公式 ホームランウイング案内
          </a>
        </li>
        <li>
          <a href="/api/park-factors/hr" target="_blank" rel="noreferrer">
            使用中の球場係数 JSON
          </a>
        </li>
      </ul>
    </section>
  );
}
