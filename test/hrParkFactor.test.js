import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeParkFactorTeam,
  normalizeParkFactorVenue,
  parseNpbGameDetail,
  calculateAdjustedHomeRuns,
} from '../shared/hrParkFactor.js';

function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

test('normalizeParkFactorTeam: 正式名・短縮名・HTML混じりを短縮名へ寄せる', () => {
  assert.equal(normalizeParkFactorTeam('読売ジャイアンツ'), '巨人');
  assert.equal(normalizeParkFactorTeam('巨人'), '巨人');
  assert.equal(normalizeParkFactorTeam('【東京ヤクルトスワローズ】'), 'ヤクルト');
  assert.equal(normalizeParkFactorTeam('横浜DeNAベイスターズ'), 'DeNA');
  // 未知の値はそのまま返す
  assert.equal(normalizeParkFactorTeam('未知の球団'), '未知の球団');
});

test('normalizeParkFactorVenue: 球場の表記揺れを正規名へ寄せる', () => {
  assert.equal(normalizeParkFactorVenue('ナゴヤドーム'), 'バンテリンドーム ナゴヤ');
  assert.equal(normalizeParkFactorVenue('西武ドーム'), 'ベルーナドーム');
  assert.equal(normalizeParkFactorVenue('千葉マリンスタジアム'), 'ZOZOマリンスタジアム');
  assert.equal(normalizeParkFactorVenue('神宮'), '明治神宮野球場');
  // 未知の球場はそのまま返す
  assert.equal(normalizeParkFactorVenue('どこかの球場'), 'どこかの球場');
});

test('parseNpbGameDetail: 終了済み公式戦の実HTMLから試合詳細を抽出する', () => {
  const html = fixture('game-detail-2024-0501-g-s-05.html');
  const detail = parseNpbGameDetail(html, '/scores/2024/0501/g-s-05/');
  assert.deepEqual(detail, {
    path: '/scores/2024/0501/g-s-05/',
    date: '2024-05-01',
    venue: '東京ドーム',
    homeTeam: '巨人',
    awayTeam: 'ヤクルト',
    homeHr: 0,
    awayHr: 2,
  });
});

test('parseNpbGameDetail: 試合終了マーカーが無ければ null', () => {
  assert.equal(parseNpbGameDetail('<html><body>試合前</body></html>'), null);
});

test('parseNpbGameDetail: ファーム戦は対象外で null', () => {
  const html = `
    <div class="game_tit"><h3>【試合終了】イースタン・リーグ 巨人 vs ヤクルト 1回戦</h3></div>
    <span class="place">東京ドーム</span>
    <time>2024年5月1日</time>
    <h4>本塁打</h4><table><tbody></tbody></table>`;
  assert.equal(parseNpbGameDetail(html), null);
});

test('calculateAdjustedHomeRuns: 球場係数で本塁打を中立換算する', () => {
  const games = [
    { venue: 'A球場', homeTeam: '巨人', awayTeam: 'ヤクルト', homeHr: 2, awayHr: 0 },
    { venue: 'B球場', homeTeam: 'ヤクルト', awayTeam: '巨人', homeHr: 1, awayHr: 3 },
  ];
  const factors = {
    'A球場': { factor: 2 },   // 打者有利 → 割り引く
    'B球場': { factor: 0.5 }, // 投手有利 → 割り増す
  };
  const result = calculateAdjustedHomeRuns(games, factors);
  // 巨人: A球場 2本/2 + B球場 3本/0.5 = 1 + 6 = 7.0
  assert.equal(result['巨人'].raw, 5);
  assert.equal(result['巨人'].adjusted, 7);
  // ヤクルト: A球場 0本/2 + B球場 1本/0.5 = 0 + 2 = 2.0
  assert.equal(result['ヤクルト'].raw, 1);
  assert.equal(result['ヤクルト'].adjusted, 2);
});

test('calculateAdjustedHomeRuns: 未知の球場は係数1として扱う', () => {
  const games = [{ venue: '無名球場', homeTeam: '巨人', awayTeam: 'ヤクルト', homeHr: 4, awayHr: 0 }];
  const result = calculateAdjustedHomeRuns(games, {});
  assert.equal(result['巨人'].raw, 4);
  assert.equal(result['巨人'].adjusted, 4);
});
