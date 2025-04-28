// api/chat.js

import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const event = req.body.event;

  if (!event || !event.text) {
    res.status(200).send('No text event.');
    return;
  }

  const slackText = event.text;
  const slackChannel = event.channel;
  const slackUser = event.user;
  const threadTs = event.thread_ts || event.ts;

  const botUserId = 'あなたのBotのユーザーID'; // 忘れずセット！

  // 👇 メンションされてるか確認
  const isMentioned = slackText.includes(`<@${botUserId}>`);
  if (!isMentioned) {
    res.status(200).send('Not mentioned.');
    return;
  }

  // 👇 メンション部分を消してきれいな本文だけ抽出
  const cleanedText = slackText.replace(`<@${botUserId}>`, '').trim();

  try {
    // まずSlackに「考え中...」を投稿
    const thinkingResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer あなたのSlack Botトークン`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannel,
        text: '考え中…🤔',  // ← ここでインジケータ出す
        thread_ts: threadTs,
      }),
    });

    const thinkingData = await thinkingResponse.json();
    const thinkingMessageTs = thinkingData.ts;  // 「考え中」メッセージのtsを取得

    // そのあとDifyへリクエスト
    const difyResponse = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer あなたのDify APIキー`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { text: cleanedText },
        user: slackUser,
      }),
    });

    const difyData = await difyResponse.json();
    const replyText = difyData.answer || 'エラー: 返答が取れませんでした。';

    // 「考え中…」メッセージを更新してDifyの答えを上書きする
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer あなたのSlack Botトークン`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannel,
        ts: thinkingMessageTs,  // ← 更新対象のメッセージ
        text: replyText,
      }),
    });

    res.status(200).send('ok');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}
