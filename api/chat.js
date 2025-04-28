// api/chat.js

export const config = {
  api: {
    bodyParser: false, // Slackリクエストを正しく受けるため
  },
};

import { buffer } from 'micro';
import fetch from 'node-fetch';

const slackBotToken = process.env.SLACK_BOT_TOKEN;
const difyApiKey = process.env.DIFY_API_KEY;
const botUserId = process.env.SLACK_BOT_USER_ID;

export default async function handler(req, res) {
  console.log('🌟 リクエスト受け取った！');

  if (req.method !== 'POST') {
    console.log('🚫 POST以外だったので終了');
    res.status(405).send('Method Not Allowed');
    return;
  }

  const rawBody = await buffer(req);
  const bodyString = rawBody.toString();
  const body = JSON.parse(bodyString);

  console.log('📦 パースしたbody:', body);

  if (body.type === 'url_verification') {
    console.log('🔗 URL検証リクエストだった');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(body.challenge);
  }

  const event = body.event;
  console.log('📩 イベント内容:', event);

  if (!event || !event.text) {
    console.log('⚠️ event.textがないので終了');
    res.status(200).send('No text event.');
    return;
  }

  const slackText = event.text;
  const slackChannel = event.channel;
  const slackUser = event.user;
  const threadTs = event.thread_ts || event.ts;

  const isMentioned = slackText.includes(`<@${botUserId}>`);
  if (!isMentioned) {
    console.log('👀 Botメンションされてないので終了');
    res.status(200).send('Not mentioned.');
    return;
  }

  const cleanedText = slackText.replace(`<@${botUserId}>`, '').trim();
  console.log('✏️ cleanedText:', cleanedText);

  console.log('✅ BotにメンションされたのでDifyへ問い合わせ開始！');

  res.status(200).send('ok'); // ここで即レス（リトライ防止）

  try {
    // Slackに「考え中…」を投稿
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

    console.log('📨 Slackに考え中メッセージ送信成功');

    // ここでさらにログ出す！
    console.log('🛫 Difyに送信開始 (query内容):', cleanedText);

    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: cleanedText,                    // 必須
        inputs: { "sys.query": cleanedText },   // 併用
        user: slackUser,
      }),
    });

    console.log('🛬 Difyリクエスト送信完了');

    const difyData = await difyResponse.json();

    console.log('🤖 Difyからのレスポンス:', difyData);

    if (!difyResponse.ok) {
      console.error('❌ Dify API error:', difyData);
      return;
    }

    const replyText = difyData.answer || 'エラー: 返答が取れませんでした。';

    console.log('📝 Slackに最終回答を投稿する');

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

    console.log('✅ Slackへの最終メッセージ投稿完了');

  } catch (error) {
    console.error('❌ 例外エラー発生:', error);
  }
}


