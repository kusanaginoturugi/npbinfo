-- 担当キャラ（prompts/personas/ の slug）を記録する。NULL は既定の解説者。
ALTER TABLE ai_comments ADD COLUMN persona TEXT;
