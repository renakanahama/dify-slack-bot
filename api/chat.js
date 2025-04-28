// api/chat.js  ── 最終版

export const config = { api: { bodyParser: false } };

import { buffer } from 'micro';
import fetch from 'node-fetch';

const {
  SLACK_BOT_TOKEN,
  DIFY_API_KEY,
  SLACK_BOT_USER_ID,
  DEBUG = 'true',          // DEBUG=true で詳細ログ
} = process.env;

const log = (...args) => DEBUG === 'true' && console.log(...args);

export default async function handler(req, res) {
  // ───────── 基本チェック
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const raw = await buffer(req);
  const body = JSON.parse(raw.toString());

  // URL 検証 (challenge)
  if (body.type === 'url_verification') {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(body.challenge);
    return;
  }

  const ev = body.event;
  if (!ev?.text) { res.status(200).end(); return; }

  // ───────── ここから本処理
  res.status(200).end();                     // 3秒以内即レス → リトライ防止

  const cleaned = ev.text.replace(`<@${SLACK_BOT_USER_ID}>`, '').trim();
  if (!cleaned) return;                      // メンションだけなら無視

  const threadTs = ev.thread_ts || ev.ts;

  // ❶ 「考え中…」を投稿
  const thinking = await slackApi('chat.postMessage', {
    channel: ev.channel,
    text: '考え中…🤔',
    thread_ts: threadTs,
  });
  if (!thinking.ok) return;                  // トークン/権限エラーなど

  // ❷ Dify に問い合わせ
  const difyRes = await fetch('https://api.dify.ai/v1/chat-messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: cleaned,                        // 必須
      inputs: { 'sys.query': cleaned },      // 高度アプリ用
      user: ev.user,
    }),
  }).then(r => r.json()).catch(err => ({ error: err.message }));

  log('dify response', difyRes);

  const answer =
    difyRes.answer ||
    (difyRes.error ? `Dify Error: ${difyRes.error}` : 'エラー: 返答が取れませんでした。');

  // ❸ 「考え中…」を上書き
  await slackApi('chat.update', {
    channel: ev.channel,
    ts: thinking.ts,
    text: answer,
  });
}

// ───────── Slack API ヘルパ
async function slackApi(method, json) {
  const resp = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(json),
  }).then(r => r.json()).catch(err => ({ ok: false, error: err.message }));
  log(method, resp);
  return resp;
}


