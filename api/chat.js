// api/chat.js
export const config = { api: { bodyParser: false } };

import { buffer } from 'micro';
import fetch from 'node-fetch';

const {
  SLACK_BOT_TOKEN,
  DIFY_API_KEY,
  SLACK_BOT_USER_ID: BOT_USER_ID,
} = process.env;

/** Slack API helper */
const slack = (method, payload) =>
  fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

export default async function handler(req, res) {
  /* 0. 受信メソッドを必ずログ */
  console.log('🌟 request', req.method);

  /* 1. POST 以外 (GET/HEAD 等) は 200 を返して即終了 */
  if (req.method !== 'POST') { res.status(200).end(); return; }

  /* 2. ボディ取得 */
  const raw = await buffer(req);
  const body = JSON.parse(raw.toString());

  /* 3. Slack URL 検証 (challenge) に応答 */
  if (body.type === 'url_verification') {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(body.challenge);
    return;
  }

  const ev = body.event;
  if (!ev?.text) { res.status(200).end(); return; }

  /* 4. Bot メンションが無ければ無視 */
  if (!ev.text.includes(`<@${BOT_USER_ID}>`)) { res.status(200).end(); return; }

  /* 5. メンションを削った本文 */
  const cleaned = ev.text.replace(`<@${BOT_USER_ID}>`, '').trim();
  if (!cleaned) { res.status(200).end(); return; }

  /* 6. 即 200 OK → Slack のリトライ防止 */
  res.status(200).end();

  try {
    /* 7) 「考え中…🤔」投稿 */
  const thinking = await slack('chat.postMessage', {
    channel: ev.channel,
    text: '考え中…🤔',
    thread_ts: ev.thread_ts || ev.ts,
  });
  console.log('📨 postMessage resp', thinking);   // ← 追加
  
  if (!thinking.ok) {
    console.error('❌ postMessage failed', thinking);
    return;                                        // 失敗なら処理を止める
  }


    /* 8. Dify 呼び出し (blocking モード推奨) */
    const dify = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: cleaned,
        inputs: { 'sys.query': cleaned },
        user: ev.user,
        response_mode: 'blocking',
      }),
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    console.log('🤖 dify', dify);

    const answer = dify.answer || dify.error || 'エラー: 返答が取れませんでした。';

    /* 9. 「考え中…」を上書き */
    const upd = await slack('chat.update', {
      channel: ev.channel,
      ts: thinking.ts,
      text: answer,
    });
    if (!upd.ok) console.error('chat.update error', upd);
  } catch (err) {
    console.error('❌ unhandled error', err);
  }
}


