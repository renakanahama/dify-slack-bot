// api/chat.js

import fetch from 'node-fetch';

const slackBotToken = process.env.SLACK_BOT_TOKEN;
const difyApiKey = process.env.DIFY_API_KEY;
const botUserId = process.env.SLACK_BOT_USER_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const event = req.body.event;

  // 👇 ここ追加！！ challenge対応
  if (req.body.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }

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

  try {
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

    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { text: cleanedText },
        user: slackUser,
      }),
    });

    const difyData = await difyResponse.json();
    const replyText = difyData.answer || 'エラー: 返答が取れませんでした。';

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
