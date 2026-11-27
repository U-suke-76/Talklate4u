import { describe, it, expect } from 'vitest';
import {
  resolveModelAdapter,
  PlamoAdapter,
  QwenAdapter,
  GemmaAdapter,
  GptOssAdapter,
  StandardChatAdapter,
  type AdapterInput,
} from '../../src/services/adapters/ModelAdapter';

const baseInput: AdapterInput = {
  text: '안녕하세요',
  sourceLang: 'ko',
  targetLangName: 'Japanese',
  systemPrompt: 'You are a translator.',
  history: [{ original: '안녕', translated: 'やあ', timestamp: 1 }],
  glossary: [{ source: '아키라', target: 'アキラ' }],
};

describe('ModelAdapter', () => {
  describe('resolveModelAdapter', () => {
    it('プロバイダーとモデル名から適切なアダプターを解決する', () => {
      expect(resolveModelAdapter('anything', 'plamo-local').family).toBe('plamo');
      expect(resolveModelAdapter('pfnet/plamo-3-translate-8b', 'openai').family).toBe('plamo');
      expect(resolveModelAdapter('qwen/qwen3-32b', 'groq').family).toBe('qwen');
      expect(resolveModelAdapter('gemma-4-e2b', 'openai').family).toBe('gemma');
      expect(resolveModelAdapter('openai/gpt-oss-120b', 'groq').family).toBe('gpt-oss');
      expect(resolveModelAdapter('llama-3.3-70b-versatile', 'groq').family).toBe('standard');
    });
  });

  describe('PlamoAdapter', () => {
    it('local モードでは system + user メッセージと fallbackPrompt を返す', () => {
      const adapter = new PlamoAdapter('local');
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0].role).toBe('system');
      expect(payload.fallbackPrompt).toBeTruthy();
      expect(payload.chat_template_kwargs?.target_lang).toBe('ja');
    });

    it('remote モードでは user メッセージのみを返す', () => {
      const adapter = new PlamoAdapter('remote');
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].role).toBe('user');
      expect(payload.fallbackPrompt).toBeUndefined();
    });

    it('1〜2文字入力に対する20文字超の過大出力を破棄する', () => {
      const adapter = new PlamoAdapter('local');
      expect(adapter.cleanOutput('これは異常に長すぎるハルシネーション出力です。', 'あ')).toBe('');
      expect(adapter.cleanOutput('こんにちは', '안녕')).toBe('こんにちは');
    });

    it('cleanPartialOutput は過大出力ガードを適用せず特殊トークンの書きかけを隠す', () => {
      const adapter = new PlamoAdapter('remote');
      expect(adapter.cleanPartialOutput('こんにちは<|plamo:tag')).toBe('こんにちは');
      expect(adapter.cleanPartialOutput('こんにちは<')).toBe('こんにちは');
    });
  });

  describe('QwenAdapter', () => {
    it('Groq では reasoning_effort: none を付与し、chat_template_kwargs は送らない', () => {
      const adapter = new QwenAdapter('groq');
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages[0].content.startsWith('/no_think\n')).toBe(true);
      expect(payload.chat_template_kwargs).toBeUndefined();
      expect(payload.extraBody).toEqual({ reasoning_effort: 'none' });
    });

    it('OpenAI 互換では chat_template_kwargs.enable_thinking: false を付与する', () => {
      const adapter = new QwenAdapter('openai');
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages[0].content.startsWith('/no_think\n')).toBe(true);
      expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(payload.extraBody).toBeUndefined();
    });

    it('<think> ブロックおよびストリーミング途中のタグ書きかけを除去する', () => {
      const adapter = new QwenAdapter('groq');
      expect(adapter.cleanOutput('<think>思考中</think>こんにちは')).toBe('こんにちは');
      expect(adapter.cleanOutput('<think>未閉じの思考')).toBe('');
      expect(adapter.cleanPartialOutput('<thi')).toBe('');
      expect(adapter.cleanPartialOutput('<think>思考中')).toBe('');
      expect(adapter.cleanPartialOutput('<think>思考中</think>こんに')).toBe('こんに');
      expect(adapter.cleanPartialOutput('こんにちは<th')).toBe('こんにちは');
    });
  });

  describe('GemmaAdapter', () => {
    it('単一 user ターンに統合し、冒頭ラベルと <think> を除去する', () => {
      const adapter = new GemmaAdapter();
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].role).toBe('user');
      expect(payload.messages[0].content).toContain('GLOSSARY');
      expect(adapter.cleanOutput('<think>hmm</think>Japanese: こんにちは')).toBe('こんにちは');
      expect(adapter.cleanPartialOutput('<think>hmm')).toBe('');
      expect(adapter.cleanPartialOutput('<think>hmm</think>Japanese: こんに')).toBe('こんに');
    });
  });

  describe('GptOssAdapter', () => {
    it('Groq では reasoning_effort: low を付与し、OpenAI 互換では付与しない', () => {
      const groqAdapter = new GptOssAdapter('groq');
      const groqPayload = groqAdapter.buildRequest(baseInput);
      expect(groqPayload.stop).toEqual(['<|']);
      expect(groqPayload.extraBody).toEqual({ reasoning_effort: 'low' });

      const openaiAdapter = new GptOssAdapter('openai');
      const openaiPayload = openaiAdapter.buildRequest(baseInput);
      expect(openaiPayload.extraBody).toBeUndefined();
    });

    it('Harmony 特殊トークン <| 以降および末尾の孤立 < を切断する', () => {
      const adapter = new GptOssAdapter('groq');
      expect(adapter.cleanOutput('こんにちは<|end|>extra')).toBe('こんにちは');
      expect(adapter.cleanPartialOutput('こんにちは<|end')).toBe('こんにちは');
      expect(adapter.cleanPartialOutput('こんにちは<')).toBe('こんにちは');
    });
  });

  describe('StandardChatAdapter', () => {
    it('マルチターンメッセージを構築し前後空白を除去する', () => {
      const adapter = new StandardChatAdapter();
      const payload = adapter.buildRequest(baseInput);
      expect(payload.messages).toHaveLength(4);
      expect(adapter.cleanOutput('  こんにちは  ')).toBe('こんにちは');
    });
  });
});
