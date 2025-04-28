// api/chat.js

export const config = {
  api: {
    bodyParser: false, // Slackリクエストを正しく受け取るため
  },
};

import { buffer } from 'micro';
import fetch from 'node-fetch';

const slackBotToken = process.env.SLACK_BOT_TOKEN;
const difyApiKey = process.env.DIFY_API_KEY;
const botUserId = process.env.SLACK_BOT_USER_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const rawBody = await buffer(req);
  const bodyString = rawBody.toString();
  const body = JSON.parse(bodyString);

  // Slack URL検証リクエスト対応
  if (body.type === 'url_verification') {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(body.challenge);
  }

  const event = body.event;

  if (!event || !event.text) {
    res.status(200).send('No text event.');
    return;
  }

  const slackText = event.text;
  const slackChannel = event.channel;
  const slackUser = event.user;
  const threadTs = event.thread_ts || event.ts;

  const isMentioned = slackText.includes(`<@${botUserId}>`);
  if (!isMentioned) {
    res.status(200).send('Not mentioned.');
    return;
  }

  const cleanedText = slackText.replace(`<@${botUserId}>`, '').trim();

  // ✅ ここで即レスする（リトライ防止！！）
  res.status(200).send('ok');

  try {
    // まずSlackに「考え中...🤔」を投稿
    const thinkingResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannel,
        text: '考え中…🤔',
        thread_ts: threadTs,
      }),
    });

    const thinkingData = await thinkingResponse.json();
    const thinkingMessageTs = thinkingData.ts;

    // Difyにチャットリクエストを送信（query + inputs両方送る）
    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: cleanedText,                    // ← ここ必須
        inputs: { "sys.query": cleanedText },   // ← これも（必要なら）
        user: slackUser,
      }),
    });

    const difyData = await difyResponse.json();

    console.log('Difyからのレスポンス:', difyData);  // ★ここ追加！！

    if (!difyResponse.ok) {
      console.error('Dify API error:', difyData);
      return;
    }

    const replyText = difyData.answer || 'エラー: 返答が取れませんでした。';

    // Slackの「考え中…」メッセージを更新
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannel,
        ts: thinkingMessageTs,
        text: replyText,
      }),
    });

  } catch (error) {
    console.error(error);
  }
}


