// api/chat.js

export const config = {
  api: {
    bodyParser: false, // Slackリクエストの生データを扱うため
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

  // リクエストボディをBufferから文字列、そしてJSONにパース
  const rawBody = await buffer(req);
  const bodyString = rawBody.toString();
  let body;
  try {
    body = JSON.parse(bodyString);
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return res.status(400).send('Invalid JSON');
  }

  // SlackのURL検証リクエストに対してchallengeを返す
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

  // Botにメンションされているか判定
  const isMentioned = slackText.includes(`<@${botUserId}>`);
  if (!isMentioned) {
    res.status(200).send('Not mentioned.');
    return;
  }

  // Botのメンション部分を取り除いて、クリーンなテキストを用意
  const cleanedText = slackText.replace(`<@${botUserId}>`, '').trim();

  try {
    // まずSlackに「考え中…🤔」というメッセージを投稿する
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

    // Dify APIへ、sys.queryフィールドでリクエストを送信する
    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { "sys.query": cleanedText },
        user: slackUser,
      }),
    });

    const difyData = await difyResponse.json();

    // Dify APIからのレスポンスがエラーの場合は詳細をログ出力
    if (!difyResponse.ok) {
      console.error('Dify API error:', difyData);
      throw new Error('Dify API call failed');
    }

    const replyText = difyData.answer || 'エラー: 返答が取れませんでした。';

    // 「考え中」メッセージを、Difyの返答で上書き更新する
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

    res.status(200).send('ok');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}
