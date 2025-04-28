// api/chat.js
export const config = { api: { bodyParser: false } };

import { buffer } from 'micro';
import fetch from 'node-fetch';

const {
  SLACK_BOT_TOKEN,
  DIFY_API_KEY,
  SLACK_BOT_USER_ID: botUserId,
} = process.env;

export default async function handler(req, res) {
  console.log('🌟 request');

  if (req.method !== 'POST') { res.status(405).end(); return; }

  const raw = await buffer(req);
  const body = JSON.parse(raw.toString());

  // URL 検証
  if (body.type === 'url_verification') {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(body.challenge);
    return;
  }

  const ev = body.event;
  if (!ev?.text) { res.status(200).end(); return; }

  // ── Bot メンション判定 & クリーンテキスト作成
  if (!ev.text.includes(`<@${botUserId}>`)) { res.status(200).end(); return; }
  const cleanedText = ev.text.replace(`<@${botUserId}>`, '').trim();
  if (!cleanedText) { res.status(200).end(); return; }

  // リトライ防止の即 200OK
  res.status(200).end();

  try {
    /** 1) 「考え中…」投稿 */
    const postResp = await slack('chat.postMessage', {
      channel: ev.channel,
      text: '考え中…🤔',
      thread_ts: ev.thread_ts || ev.ts,
    });
    if (!postResp.ok) {
      console.error('chat.postMessage error', postResp);
      return;
    }
    const thinkingTs = postResp.ts;

    /** 2) Dify へ問い合わせ */
    const dify = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: cleanedText,
        inputs: { 'sys.query': cleanedText },
        user: ev.user,
        response_mode: 'blocking',       // ← streaming で詰まる場合は blocking 固定
      }),
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    console.log('🤖 dify', dify);

    const answer = dify.answer || dify.error || 'エラー: 返答が取れませんでした。';

    /** 3) 「考え中…」メッセージを更新 */
    const upd = await slack('chat.update', {
      channel: ev.channel,
      ts: thinkingTs,
      text: answer,
    });
    if (!upd.ok) console.error('chat.update error', upd);
  } catch (err) {
    console.error('unhandled', err);
  }
}

/* Slack API helper */
function slack(method, body) {
  return fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
}


