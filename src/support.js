const SUPPORT_WEBAPP_URL = process.env.SUPPORT_WEBAPP_URL || '';

/**
 * Handle the "پشتیبانی" text command.
 *
 * @param {import('node-telegram-bot-api')} bot - Telegram bot instance
 * @param {number} chatId - Chat identifier
 */
async function handleSupportCommand(bot, chatId) {
  const supportText =
    'برای این‌که بتونی با پشتیبانی در ارتباط باشی، از طریق دکمه زیر شروع کن.\nاگر سوال یا مشکلی داشتی، اون‌جا می‌تونی مطرحش کنی 💬';

  const url = SUPPORT_WEBAPP_URL || 'https://example.com';

  await bot.sendMessage(chatId, supportText, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'روی من بزن',
            web_app: { url },
          },
        ],
      ],
    },
  });
}

module.exports = {
  handleSupportCommand,
};
