import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTeamInfo,
  getTeamOgpCode,
  getTeamPrimaryColor,
  normalizeTeamName,
  normalizeTeamNameByPartialMatch,
} from '../shared/teams.js';

test('team metadata normalizes aliases to the shared short name', () => {
  assert.equal(normalizeTeamName('読売ジャイアンツ'), '巨人');
  assert.equal(normalizeTeamName('横浜DeNAベイスターズ'), 'DeNA');
  assert.equal(normalizeTeamName('千葉ロッテマリーンズ'), 'ロッテ');
  assert.equal(normalizeTeamNameByPartialMatch('対 横浜DeNA'), 'DeNA');
});

test('team metadata exposes consistent colors and OGP codes', () => {
  assert.equal(getTeamInfo('横浜DeNA')?.official, '横浜DeNAベイスターズ');
  assert.equal(getTeamPrimaryColor('ロッテ'), '#000000');
  assert.equal(getTeamPrimaryColor('千葉ロッテマリーンズ'), '#000000');
  assert.equal(getTeamOgpCode('東京ヤクルトスワローズ'), 'YS');
});
