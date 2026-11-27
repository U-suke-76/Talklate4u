/**
 * Translation quality evaluation CLI for Talklate4u.
 *
 * Feeds YouTube transcripts (.txt / .vtt / .srt) through Talklate4u's actual
 * ModelAdapter (including PLaMo 3 Translate, Qwen, Gemma, GPT-OSS, Standard)
 * and TsvGlossaryPack pipeline against Groq or any OpenAI-compatible endpoint
 * (Colab vLLM, LM Studio, Ollama, llama-server, etc.).
 *
 * Usage:
 *   npx tsx scripts/eval-translation.ts --input <file> --model <model> [options]
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';
import dotenv from 'dotenv';
import Handlebars from 'handlebars';
import OpenAI, { ClientOptions } from 'openai';

import {
  ConversationHistoryItem,
  GlossaryPair,
  resolveModelAdapter,
} from '../src/services/adapters/ModelAdapter';
import { PromptFactory } from '../src/services/PromptFactory';
import {
  extractTsvFromZip,
  GlossaryPackMatcher,
  parseTsvGlossary,
} from '../src/services/glossary/TsvGlossaryPack';
import { detectLanguage } from '../src/utils/detectLanguage';

dotenv.config();

export interface EvalRow {
  index: number;
  sourceLang: string;
  targetLang: string;
  original: string;
  translation: string;
  glossaryHits: GlossaryPair[];
  durationMs: number;
  flags: string[];
  error?: string;
}

const TIMESTAMP_ONLY_LINE = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?$/;
const LEADING_TIMESTAMP = /^\d{1,2}:\d{2}(?::\d{2})?\s+/;
const VTT_SRT_CUE_TIMING =
  /^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}/;

function stripMarkupTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses a transcript file (.txt, .vtt, .srt) into clean utterance lines.
 * Removes timestamps, cue headers, VTT/SRT markup, and consecutive duplicates
 * commonly produced by YouTube auto-generated captions.
 */
export function parseTranscript(content: string, ext = '.txt'): string[] {
  const normalizedExt = ext.toLowerCase();
  const rawLines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const utterances: string[] = [];

  let inHeaderBlock = false;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (normalizedExt === '.vtt') {
      if (trimmed === '') {
        inHeaderBlock = false;
        continue;
      }
      if (/^(?:WEBVTT|NOTE|STYLE|REGION)\b/i.test(trimmed)) {
        inHeaderBlock = true;
        continue;
      }
      if (inHeaderBlock) {
        if (/^(?:Kind|Language):/i.test(trimmed) || !VTT_SRT_CUE_TIMING.test(trimmed)) {
          continue;
        }
        inHeaderBlock = false;
      }
      if (VTT_SRT_CUE_TIMING.test(trimmed)) continue;
      if (/^\d+$/.test(trimmed)) continue;

      const cleaned = stripMarkupTags(trimmed);
      if (cleaned && utterances[utterances.length - 1] !== cleaned) {
        utterances.push(cleaned);
      }
      continue;
    }

    if (normalizedExt === '.srt') {
      if (!trimmed) continue;
      if (/^\d+$/.test(trimmed)) continue;
      if (VTT_SRT_CUE_TIMING.test(trimmed)) continue;

      const cleaned = stripMarkupTags(trimmed);
      if (cleaned && utterances[utterances.length - 1] !== cleaned) {
        utterances.push(cleaned);
      }
      continue;
    }

    // Plain text / YouTube "Show transcript" copy-paste
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (TIMESTAMP_ONLY_LINE.test(trimmed)) continue;

    const cleaned = trimmed.replace(LEADING_TIMESTAMP, '').trim();
    if (cleaned && utterances[utterances.length - 1] !== cleaned) {
      utterances.push(cleaned);
    }
  }

  return utterances;
}

/**
 * Evaluates simple heuristic quality flags for a translated utterance.
 */
export function evaluateRowFlags(
  translation: string,
  glossaryHits: GlossaryPair[],
  error?: string,
): string[] {
  const flags: string[] = [];
  if (error) {
    flags.push('ERROR');
    return flags;
  }
  if (!translation.trim()) {
    flags.push('EMPTY');
    return flags;
  }
  if (/<\/?think>/i.test(translation)) {
    flags.push('THINK_LEAK');
  }
  if (glossaryHits.length > 0) {
    const lowerOut = translation.toLowerCase();
    const anyMissing = glossaryHits.some((g) => !lowerOut.includes(g.target.toLowerCase()));
    if (anyMissing) {
      flags.push('GLOSSARY_MISS');
    }
  }
  return flags;
}

function collectTsvFilesRecursive(dirPath: string): string[] {
  const results: string[] = [];
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsvFilesRecursive(fullPath));
    } else if (entry.isFile() && /\.(tsv|txt)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadGlossaryMatcher(glossaryPath: string): {
  matcher: GlossaryPackMatcher;
  fileCount: number;
} {
  const resolved = path.resolve(glossaryPath);
  const stat = fs.statSync(resolved);
  const tsvContents: string[] = [];

  if (stat.isDirectory()) {
    for (const fullPath of collectTsvFilesRecursive(resolved)) {
      tsvContents.push(fs.readFileSync(fullPath, 'utf-8'));
    }
  } else if (/\.zip$/i.test(resolved)) {
    const buf = fs.readFileSync(resolved);
    const extracted = extractTsvFromZip(new Uint8Array(buf));
    for (const file of extracted) {
      tsvContents.push(file.content);
    }
  } else {
    tsvContents.push(fs.readFileSync(resolved, 'utf-8'));
  }

  return {
    matcher: new GlossaryPackMatcher(parseTsvGlossary(tsvContents)),
    fileCount: tsvContents.length,
  };
}

function loadSystemPromptTemplate(): HandlebarsTemplateDelegate {
  const promptPath = path.resolve(process.cwd(), 'system_prompt.txt');
  if (fs.existsSync(promptPath)) {
    return Handlebars.compile(fs.readFileSync(promptPath, 'utf-8'));
  }
  return Handlebars.compile('{{INSTRUCTION}}\n{{GLOSSARY}}');
}

function normalizeBaseUrl(rawUrl: string): string {
  let normalized = rawUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    normalized = normalized.slice(0, -'/chat/completions'.length);
  }
  if (!normalized.endsWith('/v1') && !normalized.includes('/v1/')) {
    normalized = `${normalized}/v1`;
  }
  return normalized;
}

function escapeMdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function escapeCsvCell(text: string): string {
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatMarkdownReport(
  rows: EvalRow[],
  meta: { model: string; adapter: string; provider: string; input: string },
): string {
  const lines: string[] = [
    `# Translation Evaluation Report`,
    '',
    `- **Input**: \`${meta.input}\``,
    `- **Provider**: \`${meta.provider}\``,
    `- **Model**: \`${meta.model}\``,
    `- **Adapter**: \`${meta.adapter}\``,
    `- **Count**: ${rows.length}`,
    '',
    '| # | Dir | Original | Translation | Glossary | ms | Flags |',
    '|---:|:---:|---|---|---|---:|---|',
  ];

  for (const r of rows) {
    const glossaryStr = r.glossaryHits.map((g) => `${g.source}=>${g.target}`).join(', ');
    const flagStr = r.error ? `ERROR: ${r.error}` : r.flags.join(', ');
    lines.push(
      `| ${r.index} | ${r.sourceLang}->${r.targetLang} | ${escapeMdCell(r.original)} | ${escapeMdCell(r.translation)} | ${escapeMdCell(glossaryStr)} | ${r.durationMs} | ${escapeMdCell(flagStr)} |`,
    );
  }

  return lines.join('\n') + '\n';
}

export function formatCsvReport(rows: EvalRow[]): string {
  const header =
    'index,sourceLang,targetLang,original,translation,glossaryHits,durationMs,flags,error';
  const body = rows.map((r) =>
    [
      String(r.index),
      r.sourceLang,
      r.targetLang,
      r.original,
      r.translation,
      r.glossaryHits.map((g) => `${g.source}=>${g.target}`).join('; '),
      String(r.durationMs),
      r.flags.join(';'),
      r.error || '',
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [header, ...body].join('\n') + '\n';
}

function printHelp(): void {
  console.log(`Talklate4u Translation Evaluation CLI

Usage:
  npm run eval:translation -- --input <file> --model <model> [options]

Options:
  --input <path>        Transcript file (.txt, .vtt, .srt) [required]
  --model <name>        Model ID (e.g. pfnet/plamo-3-translate-8b-W4A16, llama-3.3-70b-versatile)
                        [required unless EVAL_MODEL is set]
  --provider <name>     "openai" (default, for OpenAI-compatible/vLLM/LM Studio) or "groq"
  --base-url <url>      Custom OpenAI-compatible Base URL (env: EVAL_BASE_URL / OPENAI_BASE_URL)
  --api-key <key>       API key (env: EVAL_API_KEY / GROQ_API_KEY / OPENAI_API_KEY)
  --glossary <path>     Glossary .tsv, .zip, or directory containing .tsv files
  --src <lang>          Source language: auto (default), ja, en, ko, zh
  --tgt <lang>          Target language: en (default), ja, ko, ja-en, ja-ko, ko-en, auto
  --limit <n>           Limit number of utterances to evaluate
  --history <n>         Conversation history window size (default: 6, 0 to disable)
  --temperature <n>     Sampling temperature (default: 0.2)
  --sleep <ms>          Delay in milliseconds between API requests (default: 0)
  --out <path>          Write report to file (.csv for CSV, otherwise Markdown)
  --dry-run             Parse transcript and match glossary without calling the API
  -h, --help            Show this help

Examples:
  # PLaMo 3 Translate (Colab vLLM / local OpenAI-compatible server)
  npm run eval:translation -- --input ../translator-glossary/eval/samples/yt.vtt \\
    --glossary ../translator-glossary/tsv --base-url http://127.0.0.1:8000/v1 \\
    --model pfnet/plamo-3-translate-8b-W4A16 --src ja --tgt en

  # Groq
  npm run eval:translation -- --input sample.txt --provider groq \\
    --model qwen/qwen3-32b --src ja --tgt en --limit 20 --out result.md
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      glossary: { type: 'string' },
      provider: { type: 'string', default: 'openai' },
      'base-url': { type: 'string' },
      'api-key': { type: 'string' },
      model: { type: 'string' },
      src: { type: 'string', default: 'auto' },
      tgt: { type: 'string', default: 'en' },
      limit: { type: 'string' },
      history: { type: 'string', default: '6' },
      temperature: { type: 'string', default: '0.2' },
      sleep: { type: 'string', default: '0' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  const inputPath = values.input;
  const model = values.model || process.env.EVAL_MODEL || '';
  const provider = values.provider === 'groq' ? 'groq' : 'openai';
  const dryRun = Boolean(values['dry-run']);

  if (!inputPath) {
    console.error('Error: --input <path> is required. Use --help for usage.');
    process.exit(1);
  }
  if (!model && !dryRun) {
    console.error('Error: --model <name> (or EVAL_MODEL) is required.');
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const rawContent = fs.readFileSync(resolvedInput, 'utf-8');
  let utterances = parseTranscript(rawContent, path.extname(resolvedInput));

  const limit = values.limit ? parseInt(values.limit, 10) : 0;
  if (limit > 0) {
    utterances = utterances.slice(0, limit);
  }

  const loadedGlossary = values.glossary ? loadGlossaryMatcher(values.glossary) : null;
  const matcher = loadedGlossary?.matcher ?? null;
  const promptTemplate = loadSystemPromptTemplate();
  const adapter = resolveModelAdapter(model, provider);
  const maxHistory = Math.max(0, parseInt(values.history || '6', 10) || 0);
  const temperature = Number(values.temperature || '0.2');
  const sleepMs = Math.max(0, parseInt(values.sleep || '0', 10) || 0);

  let client: OpenAI | null = null;
  if (!dryRun) {
    const apiKey =
      values['api-key'] ||
      process.env.EVAL_API_KEY ||
      (provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY) ||
      'dummy';

    const clientOptions: ClientOptions = { apiKey };
    if (provider === 'groq') {
      clientOptions.baseURL = 'https://api.groq.com/openai/v1';
    } else {
      const rawBaseUrl =
        values['base-url'] || process.env.EVAL_BASE_URL || process.env.OPENAI_BASE_URL;
      if (rawBaseUrl && rawBaseUrl.trim().length > 0) {
        clientOptions.baseURL = normalizeBaseUrl(rawBaseUrl);
      }
    }
    client = new OpenAI(clientOptions);
  }

  const glossarySummary = loadedGlossary ? ` | GlossaryFiles=${loadedGlossary.fileCount}` : '';
  console.log(
    `[eval] Input=${path.basename(resolvedInput)} (${utterances.length} lines) | Provider=${provider} | Model=${model || '(dry-run)'} | Adapter=${adapter.family}${glossarySummary}`,
  );

  const history: ConversationHistoryItem[] = [];
  const rows: EvalRow[] = [];

  for (let i = 0; i < utterances.length; i++) {
    const text = utterances[i];
    const detected = values.src && values.src !== 'auto' ? values.src : detectLanguage(text);
    const sourceLang = detected === 'und' ? 'Unknown' : detected;
    const { instruction, targetLang, targetLangCode } = PromptFactory.getPrompt(
      values.tgt || 'en',
      sourceLang === 'Unknown' ? undefined : sourceLang,
    );

    const glossaryHits = matcher ? matcher.match(text, sourceLang, targetLangCode) : [];
    const glossaryBlock =
      glossaryHits.length > 0
        ? `Use the following term definitions strictly:\n` +
          glossaryHits.map((g) => `- ${g.source}: ${g.target}`).join('\n')
        : '';

    const systemPrompt = promptTemplate({
      INSTRUCTION: instruction,
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
      GLOSSARY: glossaryBlock,
    });

    const adapterRequest = adapter.buildRequest({
      text,
      sourceLang: sourceLang === 'Unknown' ? undefined : sourceLang,
      targetLangName: targetLang,
      systemPrompt,
      history: maxHistory > 0 ? history.slice(-maxHistory) : [],
      glossary: glossaryHits,
    });

    if (dryRun) {
      rows.push({
        index: i + 1,
        sourceLang,
        targetLang: targetLangCode,
        original: text,
        translation: '(dry-run)',
        glossaryHits,
        durationMs: 0,
        flags: [],
      });
      continue;
    }

    const start = Date.now();
    let translation = '';
    let errorMsg: string | undefined;

    try {
      const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
        chat_template_kwargs?: Record<string, unknown>;
        [key: string]: unknown;
      } = {
        model,
        messages: adapterRequest.messages,
        temperature,
        ...(adapterRequest.extraBody || {}),
      };
      if (adapterRequest.stop && adapterRequest.stop.length > 0) {
        requestBody.stop = adapterRequest.stop;
      }
      if (adapterRequest.chat_template_kwargs) {
        requestBody.chat_template_kwargs = adapterRequest.chat_template_kwargs;
      }

      const completion = await client!.chat.completions.create(requestBody);
      const rawContent = completion.choices[0]?.message?.content || '';
      translation = adapter.cleanOutput(rawContent, text);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - start;
    const flags = evaluateRowFlags(translation, glossaryHits, errorMsg);

    if (translation && maxHistory > 0) {
      history.push({ original: text, translated: translation, timestamp: Date.now() });
      if (history.length > maxHistory) history.shift();
    }

    const row: EvalRow = {
      index: i + 1,
      sourceLang,
      targetLang: targetLangCode,
      original: text,
      translation,
      glossaryHits,
      durationMs,
      flags,
      error: errorMsg,
    };
    rows.push(row);

    const flagTag = flags.length > 0 ? ` [${flags.join(',')}]` : '';
    console.log(
      `[${i + 1}/${utterances.length}] (${durationMs}ms)${flagTag} ${text} => ${errorMsg ? `ERROR: ${errorMsg}` : translation}`,
    );

    if (sleepMs > 0 && i < utterances.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  if (values.out) {
    const outPath = path.resolve(values.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const report = /\.csv$/i.test(outPath)
      ? formatCsvReport(rows)
      : formatMarkdownReport(rows, {
          model: model || '(dry-run)',
          adapter: adapter.family,
          provider,
          input: path.basename(resolvedInput),
        });
    fs.writeFileSync(outPath, report, 'utf-8');
    console.log(`[eval] Report written to ${outPath}`);
  } else if (dryRun) {
    console.log(
      formatMarkdownReport(rows, {
        model: '(dry-run)',
        adapter: adapter.family,
        provider,
        input: path.basename(resolvedInput),
      }),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('[eval] Fatal error:', err);
    process.exit(1);
  });
}
