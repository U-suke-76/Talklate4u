import { describe, expect, it } from 'vitest';
import {
  evaluateRowFlags,
  formatCsvReport,
  formatMarkdownReport,
  parseTranscript,
} from '../../scripts/eval-translation';

describe('eval-translation utilities', () => {
  describe('parseTranscript', () => {
    it('strips timestamps and consecutive duplicates from YouTube .txt transcripts', () => {
      const txt = [
        '# sample comment',
        '0:00',
        'こんにちは、今日は配信を始めます',
        '0:04',
        'こんにちは、今日は配信を始めます',
        '1:02:15 よろしくおねがいします',
        '',
      ].join('\n');

      expect(parseTranscript(txt, '.txt')).toEqual([
        'こんにちは、今日は配信を始めます',
        'よろしくおねがいします',
      ]);
    });

    it('parses WebVTT (.vtt) stripping headers, cue timings, tags, and rolling duplicates', () => {
      const vtt = [
        'WEBVTT',
        'Kind: captions',
        'Language: ja',
        '',
        '00:00:00.000 --> 00:00:02.000 align:start position:0%',
        '<c>えっと</c><00:00:00.500><c> 今日は</c>',
        '',
        '00:00:02.000 --> 00:00:04.000',
        'えっと 今日は',
        'よろしくね',
      ].join('\n');

      expect(parseTranscript(vtt, '.vtt')).toEqual(['えっと 今日は', 'よろしくね']);
    });

    it('parses SubRip (.srt) stripping sequence numbers and timings', () => {
      const srt = [
        '1',
        '00:00:01,000 --> 00:00:03,000',
        '<i>Hello</i> world',
        '',
        '2',
        '00:00:03,500 --> 00:00:05,000',
        'Next line',
      ].join('\n');

      expect(parseTranscript(srt, '.srt')).toEqual(['Hello world', 'Next line']);
    });
  });

  describe('evaluateRowFlags', () => {
    it('detects empty output, think leaks, glossary misses, and errors', () => {
      expect(evaluateRowFlags('', [])).toEqual(['EMPTY']);
      expect(evaluateRowFlags('<think>hmm</think>Hi', [])).toEqual(['THINK_LEAK']);
      expect(evaluateRowFlags('Hello Akira', [{ source: 'アキラ', target: 'Akira' }])).toEqual([]);
      expect(evaluateRowFlags('Hello there', [{ source: 'アキラ', target: 'Akira' }])).toEqual([
        'GLOSSARY_MISS',
      ]);
      expect(evaluateRowFlags('', [], 'HTTP 500')).toEqual(['ERROR']);
    });
  });

  describe('report formatters', () => {
    const sampleRows = [
      {
        index: 1,
        sourceLang: 'ja',
        targetLang: 'en',
        original: 'アキラ | テスト',
        translation: 'Akira, test',
        glossaryHits: [{ source: 'アキラ', target: 'Akira' }],
        durationMs: 120,
        flags: [],
      },
    ];

    it('formats Markdown table with escaped pipes', () => {
      const md = formatMarkdownReport(sampleRows, {
        model: 'pfnet/plamo-3-translate-8b-W4A16',
        adapter: 'plamo',
        provider: 'openai',
        input: 'sample.vtt',
      });
      expect(md).toContain('アキラ \\| テスト');
      expect(md).toContain('アキラ=>Akira');
      expect(md).toContain('`plamo`');
    });

    it('formats CSV with proper quoting', () => {
      const csv = formatCsvReport(sampleRows);
      expect(csv).toContain('"Akira, test"');
    });
  });
});
