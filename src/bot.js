require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const { handleSupportCommand } = require('./support');
const db = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME; // e.g. @your_channel
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;

const ALL_SERVERS_PRICE_20 = Number(process.env.ALL_SERVERS_PRICE_20 || 0);
const ALL_SERVERS_PRICE_10 = Number(process.env.ALL_SERVERS_PRICE_10 || 0);
const ALL_SERVERS_PRICE_5 = Number(process.env.ALL_SERVERS_PRICE_5 || 0);
const CARD_NUMBER = process.env.CARD_NUMBER || '';

const MARZBAN_URL = process.env.MARZBAN_URL || '';
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME || '';
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || '';

const SUPPORT_WEBAPP_URL = process.env.SUPPORT_WEBAPP_URL || '';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set in .env file');
  process.exit(1);
}

// ----- Marzban API helpers (skeleton, adjust to your panel's API) -----

async function getMarzbanToken() {
  if (!MARZBAN_URL || !MARZBAN_USERNAME || !MARZBAN_PASSWORD) {
    return { ok: false, error: 'MARZBAN_URL / MARZBAN_USERNAME / MARZBAN_PASSWORD not set in .env' };
  }

  try {
    // Normalize base URL: remove trailing /dashboard (if present) and any trailing slash
    const baseUrl = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');

    const tokenUrl = `${baseUrl}/api/admin/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      // Marzban admin token endpoint expects form data (OAuth2PasswordRequestForm)
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: MARZBAN_USERNAME,
        password: MARZBAN_PASSWORD,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      const errorMessage = `Marzban token error: ${res.status} ${text}`;
      console.error('[Marzban] Token request failed', {
        url: tokenUrl,
        status: res.status,
        body: text,
      });
      return { ok: false, error: errorMessage };
    }

    const data = await res.json();
    const token = data.access_token || data.token;
    if (!token) {
      console.error('[Marzban] Token missing in response', { url: tokenUrl, data });
      return { ok: false, error: 'Marzban token not found in response. Check /api/admin/token schema.' };
    }

    return { ok: true, token };
  } catch (err) {
    console.error('[Marzban] Token request threw exception', err);
    return { ok: false, error: `Marzban token request failed: ${err.message || err}` };
  }
}

function mapVolumeLabelToGB(volumeLabel) {
  if (!volumeLabel) return null;
  if (volumeLabel.includes('20')) return 20;
  if (volumeLabel.includes('10')) return 10;
  if (volumeLabel.includes('5')) return 5;
  return null;
}

function mapTimeLabelToDays(timeLabel) {
  if (!timeLabel || timeLabel === 'تعیین نشده' || timeLabel === 'نامحدود') return null;
  if (timeLabel.includes('30')) return 30;
  if (timeLabel.includes('15')) return 15;
  return null;
}

async function createMarzbanUserFromInvoice(targetUserId, invoice) {
  const tokenResult = await getMarzbanToken();
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const token = tokenResult.token;

  // Build a username based on "VorteX-<user name>" but normalized to Marzban rules:
  // 3-32 chars, only a-z, 0-9, and underscores.
  const rawBase = invoice.userName || String(targetUserId);
  const baseWithPrefix = `vortex-${rawBase}`;
  // Normalize: lowercase, replace invalid chars with '_'
  let username = baseWithPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  // Add a small numeric suffix from userId to reduce collisions
  const suffix = String(targetUserId % 1000);
  username = `${username}_${suffix}`;
  // Enforce max length 32
  if (username.length > 32) {
    username = username.slice(0, 32);
  }
  // Ensure minimum length 3
  if (username.length < 3) {
    username = 'vortex_user';
  }

  const gb = mapVolumeLabelToGB(invoice.volumeLabel);
  // According to Marzban docs data_limit is in bytes; null or -1 often means unlimited.
  const dataLimitBytes = gb ? gb * 1024 * 1024 * 1024 : null;

  const days = mapTimeLabelToDays(invoice.timeLabel);
  // expire expected as Unix timestamp (seconds) in Marzban; null for unlimited.
  const expire = days
    ? Math.floor(Date.now() / 1000) + days * 24 * 60 * 60
    : null;

  // TODO: Adjust payload fields to exactly match your Marzban API schema.
  const payload = {
    username,
    data_limit: dataLimitBytes,
    expire,
    // At least one proxy must be defined; VMess is disabled on this server, so use only VLESS
    proxies: {
      vless: {},
    },
  };

  try {
    const baseUrl = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');
    const userUrl = `${baseUrl}/api/user`;

    const res = await fetch(userUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      const errorMessage = `Marzban create user error: ${res.status} ${text}`;
      console.error('[Marzban] Create user failed', {
        url: userUrl,
        status: res.status,
        body: text,
        payload,
      });
      return { ok: false, error: errorMessage };
    }

    const data = await res.json();

    // Try to extract a subscription/config link from common fields
    let link =
      data.subscription_url ||
      (Array.isArray(data.links) ? data.links[0] : null) ||
      (data.proxies && data.proxies.vless && data.proxies.vless[0] && data.proxies.vless[0].link) ||
      null;

    // If API returns a relative path or token, normalize to full subscription URL
    if (link && !/^https?:\/\//i.test(link)) {
      // If it already starts with /sub or sub, strip that and rebuild
      const tokenPart = link.replace(/^https?:\/\//i, '').replace(/^.*sub\/?/, '').replace(/^\//, '');
      link = `${baseUrl}/sub/${tokenPart}`;
    }

    if (!link) {
      console.warn('[Marzban] User created but no link found in response', { url: userUrl, data });
    }

    return { ok: true, link, raw: data };
  } catch (err) {
    console.error('[Marzban] Create user request threw exception', err, { payload });
    return { ok: false, error: `Marzban create user request failed: ${err.message || err}` };
  }
}

if (!CHANNEL_USERNAME) {
  console.error('CHANNEL_USERNAME is not set in .env file');
  process.exit(1);
}

// Create the bot in long polling mode
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory storage to mark first-time users during current process lifetime
const seenUsers = new Set();

// Dynamic channel configuration and membership requirement
let currentChannelUsername = CHANNEL_USERNAME;
let membershipRequired = true; // can be toggled by admin

// Track which users have already passed the current membership prompt version
let membershipPromptVersion = 0;
const userMembershipPromptVersion = new Map(); // userId -> version

// Simple per-user admin state (e.g., awaiting new channel id, in admin menus)
// mode can be: 'awaiting_channel_id' | 'admin_panel' | 'membership_config' | null
const adminStates = new Map(); // userId -> { mode: string | null }

// Per-user invoice state for purchase flow
// userId -> { serverName, timeLabel, volumeLabel, amount, lastInvoiceMessageId, stage }
const userInvoices = new Map();

// Track users who are expected to send a payment receipt
// userId -> { serverName, amount }
const awaitingReceipts = new Map();

// ─── Load persisted state from database ───
db.load();
const _saved = db.getState();
for (const uid of Object.keys(_saved.users)) seenUsers.add(Number(uid));
for (const [uid, data] of Object.entries(_saved.invoices)) userInvoices.set(Number(uid), data);
for (const [uid, data] of Object.entries(_saved.awaitingReceipts)) awaitingReceipts.set(Number(uid), data);
if (_saved.settings.channel) currentChannelUsername = _saved.settings.channel;
if (_saved.settings.membership !== undefined) membershipRequired = _saved.settings.membership === 'true';
console.log(`💾 Loaded: ${seenUsers.size} users, ${userInvoices.size} invoices, ${awaitingReceipts.size} receipts`);

// Reload all state from database (used after restore)
function reloadState() {
  db.load();
  const s = db.getState();
  seenUsers.clear();
  userInvoices.clear();
  awaitingReceipts.clear();
  for (const uid of Object.keys(s.users)) seenUsers.add(Number(uid));
  for (const [uid, data] of Object.entries(s.invoices)) userInvoices.set(Number(uid), data);
  for (const [uid, data] of Object.entries(s.awaitingReceipts)) awaitingReceipts.set(Number(uid), data);
  if (s.settings.channel) currentChannelUsername = s.settings.channel;
  if (s.settings.membership !== undefined) membershipRequired = s.settings.membership === 'true';
  console.log(`🔄 Reloaded: ${seenUsers.size} users, ${userInvoices.size} invoices, ${awaitingReceipts.size} receipts`);
}

async function isUserChannelMember(userId) {
  try {
    const member = await bot.getChatMember(currentChannelUsername, userId);
    const status = member.status;
    return ['member', 'administrator', 'creator', 'owner'].includes(status);
  } catch (err) {
    console.error('Error checking membership in isUserChannelMember:', err.message || err);
    // In case of error (e.g., bot not admin), treat as not a member so UI still asks to join
    return false;
  }
}

function getMainKeyboard(isAdmin) {
  const keyboard = [];

  // User menu
  keyboard.push(['خرید']);
  keyboard.push(['پشتیبانی']);

  // For now, only admin gets management panel button
  if (isAdmin) {
    keyboard.push(['پنل مدیریت']);
  }

  if (keyboard.length === 0) {
    return undefined;
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function getAllServersInvoiceKeyboard(invoice) {
  const rows = [];

  rows.push(['تعیین زمان', 'تعیین حجم']);

  // If amount is set, show پرداخت button in its own row
  if (invoice && invoice.amount != null) {
    rows.push(['پرداخت']);
  }

  rows.push(['بازگشت']);

  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function getAdminPanelKeyboard() {
  return {
    keyboard: [
      ['عضویت در کانال'],
      ['بازگشت'],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function getMembershipConfigKeyboard() {
  return {
    keyboard: [
      ['تغییر آیدی کانال', 'ریست عضویت ها'],
      ['فعال', 'غیر فعال'],
      ['بازگشت'],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isFirstTime = !seenUsers.has(userId);
  if (isFirstTime) {
    seenUsers.add(userId);
    db.saveUser(userId, msg.from.username, msg.from.first_name);
  }

  const isAdmin = ADMIN_ID && userId === ADMIN_ID;
  // Always check membership first when it is required
  const alreadyMember = membershipRequired ? await isUserChannelMember(userId) : true;

  if (alreadyMember) {
    const welcomeText = isFirstTime
      ? 'خوش اومدی به ربات VorteX VPN 👋\n\n✅ عضویتت در کانال تأیید شده و از این به بعد می‌تونی خیلی راحت از داخل ربات سرویس بخری، تمدید کنی و رسید پرداخت بفرستی.\n\nاز دکمه‌های پایین می‌تونی خرید رو شروع کنی یا بعداً هر وقت خواستی دوباره /start بزنی و برگردی به منوی اصلی.'
      : 'تو الان عضو کانال هستی و می‌تونی از امکانات ربات استفاده کنی ✅\n\nبرای شروع، از دکمه "خرید" پایین استفاده کن و سرور و حجم مورد نظرت رو انتخاب کن.';

    const mainKeyboard = getMainKeyboard(isAdmin);
    const options = mainKeyboard ? { reply_markup: mainKeyboard } : undefined;

    await bot.sendMessage(chatId, welcomeText, options);
    return;
  }

  const membershipText = isFirstTime
    ? 'برای استفاده از ربات، لطفاً ابتدا در کانال زیر عضو شو و بعد روی دکمه "بررسی عضویت" بزن تا دسترسی‌ات فعال بشه.'
    : 'برای استفاده از ربات باید عضو کانال باشی. بعد از عضویت، روی دکمه "بررسی عضویت" بزن.';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'عضویت در کانال 📢',
            url: `https://t.me/${currentChannelUsername.replace('@', '')}`,
          },
        ],
        [
          {
            text: 'بررسی عضویت ✅',
            callback_data: 'check_membership',
          },
        ],
      ],
    },
  };

  await bot.sendMessage(chatId, membershipText, options);
});

// Clear all in-memory state for this user so the bot behaves like first use again
bot.onText(/\/clear/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  seenUsers.delete(userId);
  userMembershipPromptVersion.delete(userId);
  userInvoices.delete(userId);
  awaitingReceipts.delete(userId);
  adminStates.delete(userId);
  db.removeInvoice(userId);
  db.removeAwaitingReceipt(userId);

  await bot.sendMessage(
    chatId,
    'همه تنظیمات و وضعیت ربات برای حساب شما ریست شد. می‌تونی دوباره مثل دفعهٔ اول از /start استفاده کنی.'
  );
});

bot.on('callback_query', async (query) => {
  if (!query.data) return;

  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'check_membership') {
    try {
      const alreadyMember = await isUserChannelMember(userId);

      if (alreadyMember) {
        await bot.answerCallbackQuery(query.id, {
          text: 'عضویت شما در کانال تأیید شد ✅',
          show_alert: false,
        });

        await bot.sendMessage(chatId, 'شما عضو کانال هستید. می‌توانید از امکانات ربات استفاده کنید.');
      } else {
        await bot.answerCallbackQuery(query.id, {
          text: 'شما هنوز عضو کانال نیستید. لطفاً ابتدا در کانال عضو شوید.',
          show_alert: true,
        });
      }
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err);
      console.error('Error checking membership:', message);

      // If query is too old or invalid, do not try to answer it again
      if (message.includes('query is too old') || message.includes('query ID is invalid')) {
        return;
      }

      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'خطا در بررسی عضویت. بعداً دوباره تلاش کنید.',
          show_alert: true,
        });
      } catch (answerErr) {
        // Ignore secondary errors from answerCallbackQuery to avoid crashing the bot
        console.error('Error answering callback after membership error:', answerErr.message || answerErr);
      }
    }
  }

  // User pressed inline button to send payment receipt for "همه سرورها"
  if (query.data === 'send_receipt_all_servers') {
    const invoice = userInvoices.get(userId);

    // Only proceed if we have an invoice with amount
    if (!invoice || invoice.amount == null) {
      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'ابتدا فاکتور و مبلغ باید مشخص شود.',
          show_alert: true,
        });
      } catch (e) {}
      return;
    }

    awaitingReceipts.set(userId, {
      serverName: invoice.serverName,
      amount: invoice.amount,
    });
    db.saveAwaitingReceipt(userId, { serverName: invoice.serverName, amount: invoice.amount });

    try {
      await bot.answerCallbackQuery(query.id, {
        text: 'لطفاً رسید پرداخت را به صورت عکس ارسال کن (فقط عکس).',
        show_alert: true,
      });
    } catch (e) {
      // ignore
    }

    await bot.sendMessage(
      chatId,
      'لطفاً اون رسیدی که پرداخت کردی رو به صورت عکس برای من بفرست.\nفقط عکس بفرست عزیز 🌟'
    );

    return;
  }

  // Admin approval / rejection of receipts for "همه سرورها"
  if (query.data && query.data.startsWith('confirm_receipt_all_')) {
    const parts = query.data.split('_');
    const targetUserId = Number(parts[parts.length - 1]);

    try {
      await bot.answerCallbackQuery(query.id, { text: 'رسید تأیید شد ✅', show_alert: false });
    } catch (e) {}

    await bot.sendMessage(
      targetUserId,
      'کاربر عزیز، رسیدی که فرستادی دریافت و تأیید شد ✅\nدر حال آماده‌سازی کانفیگ سرور هستیم؛ معمولاً حدود ۱ دقیقه طول می‌کشه، لطفاً کمی صبر کن.'
    );

    // Try to create Marzban user based on the invoice
    const invoice = userInvoices.get(targetUserId);
    if (invoice) {
      const result = await createMarzbanUserFromInvoice(targetUserId, invoice);

      if (result.ok) {
        if (result.link) {
          // Delay sending config link by ~1 minute so it doesn't arrive immediately
          setTimeout(() => {
            bot
              .sendMessage(
                targetUserId,
                'لینک کانفیگ سرور شما آماده شد:\n' + result.link
              )
              .catch((err) => {
                console.error('[Telegram] Failed to send config link after delay', err);
              });
          }, 60 * 1000);
        } else {
          // No link in response; notify admin for manual follow-up
          if (ADMIN_ID) {
            await bot.sendMessage(
              ADMIN_ID,
              'هشدار: کاربر تأیید شد اما لینک کانفیگ در پاسخ Marzban پیدا نشد. لطفاً پاسخ API را بررسی کن.'
            );
          }
        }
      } else if (ADMIN_ID) {
        await bot.sendMessage(
          ADMIN_ID,
          'خطا در ساخت کاربر در مرزبان پس از تأیید رسید:\n' + (result.error || 'Unknown error')
        );
      }
    }

    return;
  }

  if (query.data && query.data.startsWith('reject_receipt_all_')) {
    const parts = query.data.split('_');
    const targetUserId = Number(parts[parts.length - 1]);

    try {
      await bot.answerCallbackQuery(query.id, { text: 'رسید رد شد ❌', show_alert: false });
    } catch (e) {}

    await bot.sendMessage(
      targetUserId,
      'کاربر عزیز، رسید پرداختت تأیید نشد. لطفاً در صورت نیاز با پشتیبانی در ارتباط باش یا مجدداً رسید صحیح را ارسال کن.'
    );

    return;
  }
});

// Handle incoming receipt photos from users
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const pending = awaitingReceipts.get(userId);
  if (!pending) {
    return; // not expecting a receipt from this user
  }

  // Stop awaiting further receipts for now
  awaitingReceipts.delete(userId);
  db.removeAwaitingReceipt(userId);

  const userName = msg.from.first_name || 'کاربر';
  const amountText = `${pending.amount.toLocaleString('fa-IR')} 💰`;

  // Photo info (use highest resolution)
  const photos = msg.photo || [];
  const photo = photos[photos.length - 1];
  if (!photo) {
    return;
  }

  // Message for the user
  await bot.sendMessage(
    chatId,
    'کاربر عزیز ' +
      userName +
      '\n____________________________________\n' +
      'رسیدی که فرستادی دریافت شدش ✅\n' +
      'ممکنه که بین ۴ تا ۱۵ دقیقه طول بکشه تا رسیدت تأیید بشه، یکم صبر کن!\n' +
      '____________________________________'
  );

  // Notify admin with the receipt and inline buttons
  if (ADMIN_ID) {
    const adminIntroText =
      'ادمین عزیز، یک رسید جدید دریافت شد.\n' +
      `کاربر: ${userName}\n` +
      `سرور: ${pending.serverName}\n` +
      `مبلغ: ${amountText}\n` +
      'این رسید رو بررسی کن و در صورت تأیید، دکمه مناسب رو بزن.';

    await bot.sendMessage(ADMIN_ID, adminIntroText);

    await bot.sendPhoto(ADMIN_ID, photo.file_id, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'تایید رسید ',
              callback_data: `confirm_receipt_all_${userId}`,
            },
            {
              text: 'رد رسید ',
              callback_data: `reject_receipt_all_${userId}`,
            },
          ],
        ],
      },
    });
  }
});

bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

   // Debug: log incoming text to help diagnose button labels
   console.log('Incoming text message:', { userId, text });

  const isAdmin = ADMIN_ID && userId === ADMIN_ID;

  // Handle admin state for changing channel id
  const state = adminStates.get(userId);
  if (isAdmin && state && state.mode === 'awaiting_channel_id') {
    // Treat this message as new channel username
    let newChannel = text;
    if (!newChannel.startsWith('@')) {
      newChannel = '@' + newChannel;
    }

    currentChannelUsername = newChannel;
    db.saveSetting('channel', newChannel);
    adminStates.set(userId, { mode: null });

    await bot.sendMessage(
      chatId,
      `آیدی کانال با موفقیت به ${currentChannelUsername} تغییر کرد.`,
      { reply_markup: getMembershipConfigKeyboard() }
    );

    return;
  }

  // User command: خرید (works for both admin and non-admin)
  if (text === 'خرید') {
    await bot.sendMessage(
      chatId,
      'لطفاً برای خرید کردن از یکی از سرورهای زیر استفاده کنید.',
      {
        reply_markup: {
          keyboard: [['همه سرور ها'], ['بازگشت']],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }
    );

    return;
  }

  // User command: پشتیبانی
  if (text === 'پشتیبانی') {
    await handleSupportCommand(bot, chatId);
    return;
  }

  // همه سرور ها: start invoice flow for this server
  if (text === 'همه سرور ها') {
    const userName = msg.from.first_name || 'کاربر';

    // Initialize invoice state for this user
    userInvoices.set(userId, {
      serverName: 'همه سرورها',
      userName,
      timeLabel: 'تعیین نشده',
      volumeLabel: 'تعیین نشده',
      amount: null,
      lastInvoiceMessageId: null,
      stage: 'invoice',
    });
    db.saveInvoice(userId, userInvoices.get(userId));

    // Render initial styled invoice
    const invoiceText =
      `<b>🧾 فاکتور انتخاب سرور</b>\n` +
      `👤 <b>نام کاربر:</b> ${userName}\n` +
      '━━━━━━━━━━━━━━━━━━\n' +
      '📦 <b>جزئیات سفارش:</b>\n' +
      `• <b>اسم سرور:</b> همه سرورها\n` +
      `• <b>زمان سرور:</b> تعیین نشده ⏱️\n` +
      `• <b>حجم:</b> تعیین نشده 📦\n` +
      `• <b>مبلغ:</b> براساس حجم تعیین میشه 💰\n` +
      '━━━━━━━━━━━━━━━━━━\n' +
      'از طریق دکمه‌های زیر می‌تونی <b>زمان</b> و <b>حجم</b> سرورت رو تنظیم کنی.';

    const sent = await bot.sendMessage(chatId, invoiceText, {
      parse_mode: 'HTML',
      reply_markup: getAllServersInvoiceKeyboard(userInvoices.get(userId)),
    });

    const inv = userInvoices.get(userId);
    if (inv) {
      inv.lastInvoiceMessageId = sent.message_id;
      userInvoices.set(userId, inv);
      db.saveInvoice(userId, inv);
    }

    return;
  }

  // Handle invoice-related actions for all servers ("همه سرورها", "آلمان 1", "آلمان 2")
  const currentInvoice = userInvoices.get(userId);

  async function sendUpdatedAllServersInvoice() {
    if (!currentInvoice) return;

    const userName = msg.from.first_name || 'کاربر';

    const amountText =
      currentInvoice.amount == null
        ? 'براساس حجم تعیین میشه 💰'
        : `${currentInvoice.amount.toLocaleString('fa-IR')} 💰`; // format number

    const textBody =
      '📦 <b>جزئیات سفارش:</b>\n' +
      `• <b>اسم سرور:</b> ${currentInvoice.serverName}\n` +
      `• <b>زمان سرور:</b> ${currentInvoice.timeLabel} ⏱️\n` +
      `• <b>حجم:</b> ${currentInvoice.volumeLabel} 📦\n` +
      `• <b>مبلغ:</b> ${amountText}\n` +
      '━━━━━━━━━━━━━━━━━━\n' +
      'از طریق دکمه‌های زیر می‌تونی <b>زمان</b> و <b>حجم</b> سرورت رو تنظیم کنی.';

    const header = `<b>🧾 فاکتور انتخاب سرور</b>\n👤 <b>نام کاربر:</b> ${userName}\n━━━━━━━━━━━━━━━━━━\n`;

    // Try to delete previous invoice message
    if (currentInvoice.lastInvoiceMessageId) {
      try {
        await bot.deleteMessage(chatId, currentInvoice.lastInvoiceMessageId);
      } catch (e) {
        // ignore delete errors
      }
    }

    const sent = await bot.sendMessage(chatId, header + textBody, {
      parse_mode: 'HTML',
      reply_markup: getAllServersInvoiceKeyboard(currentInvoice),
    });

    currentInvoice.lastInvoiceMessageId = sent.message_id;
    currentInvoice.stage = 'invoice';
    userInvoices.set(userId, currentInvoice);
    db.saveInvoice(userId, currentInvoice);
  }

  if (currentInvoice && currentInvoice.serverName === 'همه سرورها') {
    if (text === 'تعیین زمان') {
      await bot.sendMessage(chatId, 'لطفاً زمانی که می‌خوای رو بگو:', {
        reply_markup: {
          keyboard: [['نامحدود'], ['30 روزه', '15 روزه'], ['بازگشت']],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });

      return;
    }

    if (text === 'نامحدود' || text === '30 روزه' || text === '15 روزه') {
      currentInvoice.timeLabel = text;
      await sendUpdatedAllServersInvoice();
      return;
    }

    if (text === 'پرداخت') {
      if (currentInvoice.amount == null) {
        await bot.sendMessage(chatId, 'اول حجم رو انتخاب کن تا مبلغ نهایی مشخص بشه، بعد می‌تونی پرداخت رو انجام بدی.');
        return;
      }

      const amountText = `${currentInvoice.amount.toLocaleString('fa-IR')} 💰`;
      const cardText = CARD_NUMBER || '---';

      const payText =
        `مبلغی که باید پرداخت کنی (${amountText}) رو به شماره کارت زیر واریز کن!

شماره کارت: <code>${cardText}</code>`;

      await bot.sendMessage(chatId, payText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'فرستادن رسید پرداخت',
                callback_data: 'send_receipt_all_servers',
              },
            ],
          ],
        },
      });

      return;
    }

    if (text === 'تعیین حجم') {
      await bot.sendMessage(
        chatId,
        'از طریق دکمه‌های زیر حجمی که می‌خوای رو انتخاب کن.',
        {
          reply_markup: {
            keyboard: [['20 گیگ', '10 گیگ', '5 گیگ'], ['بازگشت']],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      );

      currentInvoice.stage = 'volume_select';
      userInvoices.set(userId, currentInvoice);
      db.saveInvoice(userId, currentInvoice);

      return;
    }

    if (text === '20 گیگ' || text === '10 گیگ' || text === '5 گیگ') {
      currentInvoice.volumeLabel = text;

      if (text === '20 گیگ') {
        currentInvoice.amount = ALL_SERVERS_PRICE_20 || null;
      } else if (text === '10 گیگ') {
        currentInvoice.amount = ALL_SERVERS_PRICE_10 || null;
      } else if (text === '5 گیگ') {
        currentInvoice.amount = ALL_SERVERS_PRICE_5 || null;
      }

      await sendUpdatedAllServersInvoice();
      return;
    }

    if (text === 'بازگشت') {
      // Back inside purchase flow
      if (currentInvoice.stage === 'time_select' || currentInvoice.stage === 'volume_select') {
        // Go back to invoice view
        await sendUpdatedAllServersInvoice();
        return;
      }

      if (currentInvoice.stage === 'invoice') {
        // Leave invoice flow and go back to server list under "خرید"
        userInvoices.delete(userId);
        db.removeInvoice(userId);

        await bot.sendMessage(
          chatId,
          'بازگشت به لیست سرورها.',
          {
            reply_markup: {
              keyboard: [['همه سرور ها'], ['آلمان 1', 'آلمان 2'], ['بازگشت']],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        );

        return;
      }
    }
  }

  // Global back button from server list (when not inside an invoice flow)
  if (text === 'بازگشت' && !currentInvoice) {
    const mainKeyboard = getMainKeyboard(isAdmin);
    await bot.sendMessage(chatId, 'بازگشت به منوی اصلی.', {
      reply_markup: mainKeyboard,
    });

    return;
  }

  // Admin command to notify a user that their config/plan has expired and offer renewal
  if (isAdmin && text.startsWith('/notify_expire')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await bot.sendMessage(chatId, 'استفاده صحیح: /notify_expire <TELEGRAM_ID>');
      return;
    }

    const targetUserId = Number(parts[1]);
    if (!targetUserId || Number.isNaN(targetUserId)) {
      await bot.sendMessage(chatId, 'آیدی کاربر معتبر نیست. لطفاً یک عدد صحیح وارد کن.');
      return;
    }

    const invoice = userInvoices.get(targetUserId);
    if (!invoice || invoice.serverName !== 'همه سرورها') {
      await bot.sendMessage(
        chatId,
        'برای این کاربر فاکتور "همه سرورها" ذخیره نشده است. ابتدا باید یک خرید اولیه برای او انجام شده باشد.'
      );
      return;
    }

    await bot.sendMessage(
      targetUserId,
      'کاربر عزیز، سرویس/کانفیگت به پایان رسیده (اتمام زمان یا حجم). اگر می‌خوای همون سرویس رو تمدید کنی، روی دکمه زیر بزن.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'تمدید همین کانفیگ 🔁',
                callback_data: `renew_all_${targetUserId}`,
              },
            ],
          ],
        },
      }
    );

    await bot.sendMessage(chatId, `اعلان اتمام سرویس برای کاربر ${targetUserId} ارسال شد.`);

    return;
  }

  // Non-admins don't handle admin panel related commands
  if (!isAdmin) {
    return;
  }

  if (text === 'پنل مدیریت') {
    adminStates.set(userId, { mode: 'admin_panel' });

    await bot.sendMessage(chatId, 'پنل مدیریت:', {
      reply_markup: getAdminPanelKeyboard(),
    });

    return;
  }

  if (text === 'عضویت در کانال') {
    adminStates.set(userId, { mode: 'membership_config' });

    await bot.sendMessage(
      chatId,
      'از طریق دکمه‌های زیر می‌توانید عضویت در کانال را برای ربات تنظیم کنید.',
      { reply_markup: getMembershipConfigKeyboard() }
    );

    return;
  }

  if (text === 'تغییر آیدی کانال') {
    adminStates.set(userId, { mode: 'awaiting_channel_id' });

    await bot.sendMessage(chatId, 'لطفاً آیدی کانال را ارسال کنید (مثال: @MyChannel).');

    return;
  }

  if (text === 'فعال') {
    membershipRequired = true;
    db.saveSetting('membership', 'true');
    await bot.sendMessage(chatId, 'شرط عضویت در کانال فعال شد.');
    return;
  }

  if (text === 'غیر فعال') {
    membershipRequired = false;
    db.saveSetting('membership', 'false');
    await bot.sendMessage(chatId, 'شرط عضویت در کانال غیر فعال شد.');
    return;
  }

  if (text === 'ریست عضویت ها') {
    membershipPromptVersion += 1;
    userMembershipPromptVersion.clear();

    await bot.sendMessage(
      chatId,
      'وضعیت عضویت همه کاربران ریست شد. از این پس، برای همه کاربران در اولین /start بعدی دوباره پیام عضویت ارسال می‌شود.',
      { reply_markup: getMembershipConfigKeyboard() }
    );

    return;
  }

  if (text === 'بازگشت') {
    const currentState = adminStates.get(userId) || { mode: null };

    // If admin is in membership config, go back to main admin panel
    if (currentState.mode === 'membership_config') {
      adminStates.set(userId, { mode: 'admin_panel' });

      await bot.sendMessage(chatId, 'بازگشت به پنل مدیریت.', {
        reply_markup: getAdminPanelKeyboard(),
      });

      return;
    }

    // If admin is in admin panel (or unknown), go back to main user menu
    adminStates.set(userId, { mode: null });

    await bot.sendMessage(chatId, 'بازگشت به منوی اصلی.', {
      reply_markup: getMainKeyboard(true),
    });

    return;
  }
});

console.log('Telegram bot is running...');

// === Web Panel Integration ===
module.exports = {
  bot,
  seenUsers,
  userInvoices,
  awaitingReceipts,
  getChannelUsername: () => currentChannelUsername,
  getMembershipRequired: () => membershipRequired,
  getMarzbanToken,
  createMarzbanUserFromInvoice,
  reloadState,
};
