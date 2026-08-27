const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vortex2024';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CARD_NUMBER = process.env.CARD_NUMBER || '';
const MARZBAN_URL = process.env.MARZBAN_URL || '';
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME || '';
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || '';

let botState = null;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'vortex-panel-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
}));

function auth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

// ═══════════════════════════════════════════
//  MASTER LAYOUT
// ═══════════════════════════════════════════
const NAV = [
  { href: '/', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`, label: 'داشبورد' },
  { href: '/orders', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>`, label: 'سفارشات' },
  { href: '/users', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: 'کاربران' },
  { href: '/marzban', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`, label: 'مرزبان' },
  { href: '/settings', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`, label: 'تنظیمات' },
];

function layout(title, activePage, bodyHtml) {
  const navHtml = NAV.map(item => {
    const active = activePage === item.href;
    return `
    <a href="${item.href}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:14px;font-size:14px;font-weight:500;text-decoration:none;position:relative;transition:all .25s ease;${active
      ? 'background:linear-gradient(135deg,rgba(108,92,231,.18),rgba(168,85,247,.12));color:#fff;box-shadow:0 4px 20px rgba(108,92,231,.15),inset 0 1px 0 rgba(255,255,255,.05);border:1px solid rgba(108,92,231,.25);'
      : 'color:#7a7a9a;border:1px solid transparent;'}"
      onmouseenter="if(!this.classList.contains('nav-active')){this.style.background='rgba(255,255,255,.04)';this.style.color='#c8c8e0';this.style.borderColor='rgba(255,255,255,.06)';}"
      onmouseleave="if(!this.classList.contains('nav-active')){this.style.background='';this.style.color='#7a7a9a';this.style.borderColor='transparent';}">
      ${active ? '<span style="position:absolute;right:-12px;top:50%;transform:translateY(-50%);width:4px;height:24px;background:linear-gradient(180deg,#6c5ce7,#a855f7);border-radius:0 4px 4px 0;box-shadow:0 0 12px rgba(108,92,231,.5);"></span>' : ''}
      <span style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .25s ease;${active
        ? 'background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;box-shadow:0 4px 15px rgba(108,92,231,.4);'
        : 'background:rgba(255,255,255,.04);color:#5a5a7a;'}">${item.icon}</span>
      <span style="flex:1">${item.label}</span>
      ${active ? '<span style="width:6px;height:6px;border-radius:50%;background:#a29bfe;box-shadow:0 0 8px #6c5ce7;"></span>' : ''}
    </a>`;
  }).join('');

  const bottomNavHtml = NAV.map(item => {
    const active = activePage === item.href;
    return `<a href="${item.href}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 12px;border-radius:12px;text-decoration:none;transition:all .25s ease;min-width:56px;${active
      ? 'background:linear-gradient(135deg,rgba(108,92,231,.2),rgba(168,85,247,.15));color:#a29bfe;box-shadow:0 2px 12px rgba(108,92,231,.2);'
      : 'color:#5a5a7a;'}"
      onmouseenter="if(this.style.color!=='rgb(162, 155, 254)'){this.style.background='rgba(255,255,255,.04)';this.style.color='#8a8aaa';}"
      onmouseleave="if(this.style.color!=='rgb(162, 155, 254)'){this.style.background='';this.style.color='#5a5a7a';}">
      <span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;transition:all .25s ease;${active
        ? 'background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;box-shadow:0 2px 10px rgba(108,92,231,.4);'
        : 'background:rgba(255,255,255,.04);color:#5a5a7a;'}">${item.icon}</span>
      <span style="font-size:10px;font-weight:${active?'700':'500'};${active?'color:#a29bfe;':''}">${item.label}</span>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#07070e">
  <title>${title} · VorteX</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#07070e;--bg2:#0d0d18;--card:#111120;--card2:#16162a;--elevated:#1a1a30;
      --border:#1e1e3a;--border2:#2a2a50;
      --t1:#f0f0f8;--t2:#8888a8;--t3:#55556a;
      --accent:#6c5ce7;--accent2:#a29bfe;--glow:rgba(108,92,231,0.3);
      --ok:#00d2a0;--ok-bg:rgba(0,210,160,0.1);
      --warn:#feca57;--warn-bg:rgba(254,202,87,0.1);
      --err:#ff6b6b;--err-bg:rgba(255,107,107,0.1);
      --info:#48dbfb;--info-bg:rgba(72,219,251,0.1);
      --sb:280px;--bn:72px;--r:16px;--rs:10px;--rxs:6px;
    }
    html{scroll-behavior:smooth}
    body{font-family:'Vazirmatn',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;min-height:100dvh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    ::-webkit-scrollbar{width:5px;height:5px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px}

    .app{display:flex;min-height:100vh;min-height:100dvh}

    /* Sidebar */
    .sb{position:fixed;right:12px;top:12px;bottom:12px;width:var(--sb);background:linear-gradient(180deg,rgba(14,14,30,.97) 0%,rgba(16,16,36,.97) 50%,rgba(14,14,30,.97) 100%);border:1px solid rgba(108,92,231,.12);border-radius:20px;display:flex;flex-direction:column;z-index:100;transition:transform .4s cubic-bezier(.16,1,.3,1);overflow:hidden;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 8px 40px rgba(0,0,0,.4),0 0 0 1px rgba(108,92,231,.05),inset 0 1px 0 rgba(255,255,255,.03)}
    .sb::before{content:'';position:absolute;top:0;left:0;right:0;height:180px;background:radial-gradient(ellipse at top right,rgba(108,92,231,.1),transparent 70%);pointer-events:none;border-radius:20px 20px 0 0}
    .sb::after{content:'';position:absolute;bottom:0;left:0;right:0;height:120px;background:radial-gradient(ellipse at bottom left,rgba(168,85,247,.06),transparent 70%);pointer-events:none;border-radius:0 0 20px 20px}
    .sb-hd{padding:24px 20px 18px;border-bottom:1px solid rgba(108,92,231,.08);position:relative;z-index:1}
    .sb-nav{flex:1;padding:14px 10px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;position:relative;z-index:1}
    .sb-nav::-webkit-scrollbar{width:3px}
    .sb-nav::-webkit-scrollbar-thumb{background:rgba(108,92,231,.2);border-radius:10px}
    .sb-ft{padding:14px 10px;border-top:1px solid rgba(108,92,231,.08);position:relative;z-index:1}

    .main{flex:1;margin-right:calc(var(--sb) + 24px);padding:24px;min-height:100vh;min-height:100dvh}
    .main::-webkit-scrollbar{width:5px}
    .main::-webkit-scrollbar-track{background:transparent;margin:8px 0}
    .main::-webkit-scrollbar-thumb{background:rgba(108,92,231,.2);border-radius:10px}
    .main::-webkit-scrollbar-thumb:hover{background:rgba(108,92,231,.35)}
    .main{scrollbar-color:rgba(108,92,231,.2) transparent;scrollbar-width:thin}

    /* Bottom Nav */
    .bn{display:none;position:fixed;bottom:0;left:0;right:0;height:auto;background:rgba(10,10,22,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-top:1px solid rgba(108,92,231,.1);z-index:100;padding:8px 12px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0));box-shadow:0 -4px 30px rgba(0,0,0,.4)}
    .bn-in{display:flex;align-items:center;justify-content:space-around;max-width:500px;margin:0 auto;background:rgba(255,255,255,.04);border-radius:16px;padding:6px 4px;border:1px solid rgba(255,255,255,.04)}

    /* Overlay */
    .ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:99;opacity:0;transition:opacity .3s ease;pointer-events:none}
    .ov.on{opacity:1;pointer-events:auto}

    .mt{display:none;position:fixed;top:0;left:0;right:0;z-index:50;padding:16px 60px 16px 16px;background:rgba(7,7,14,.8);backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
    .mh{display:none}

    /* Card */
    .cd{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;transition:all .3s}
    .cd:hover{border-color:var(--border2)}
    .cd-h{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
    .cd-b{padding:20px 24px}

    /* Stat */
    .st{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;position:relative;overflow:hidden;transition:all .3s}
    .st::before{content:'';position:absolute;top:0;right:0;width:100px;height:100px;border-radius:50%;filter:blur(40px);opacity:.15;transition:opacity .3s}
    .st:hover{border-color:var(--border2);transform:translateY(-2px)}
    .st:hover::before{opacity:.25}
    .st.i::before{background:#6c5ce7}.st.g::before{background:#00d2a0}.st.a::before{background:#feca57}.st.b::before{background:#48dbfb}
    .sti{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:16px}
    .sti.i{background:rgba(108,92,231,.15);color:#a29bfe}.sti.g{background:var(--ok-bg);color:var(--ok)}.sti.a{background:var(--warn-bg);color:var(--warn)}.sti.b{background:var(--info-bg);color:var(--info)}

    /* Table */
    .tw{overflow-x:auto}
    table{width:100%;border-collapse:collapse}
    thead th{padding:14px 20px;text-align:right;font-size:12px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border);white-space:nowrap}
    tbody td{padding:14px 20px;font-size:14px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);transition:background .15s}
    tbody tr{transition:background .15s}
    tbody tr:hover{background:rgba(255,255,255,.02)}
    tbody tr:last-child td{border-bottom:none}

    /* Badge */
    .bdg{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:600;white-space:nowrap}
    .bdg-ok{background:var(--ok-bg);color:var(--ok)}.bdg-w{background:var(--warn-bg);color:var(--warn)}.bdg-e{background:var(--err-bg);color:var(--err)}.bdg-i{background:var(--info-bg);color:var(--info)}.bdg-m{background:rgba(255,255,255,.05);color:var(--t3)}.bdg-ac{background:rgba(108,92,231,.15);color:var(--accent2)}

    /* Button */
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:var(--rs);font-family:inherit;font-size:14px;font-weight:600;border:none;cursor:pointer;transition:all .2s;white-space:nowrap}
    .btn:active{transform:scale(.97)}
    .btn-p{background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;box-shadow:0 4px 15px rgba(108,92,231,.3)}
    .btn-p:hover{box-shadow:0 6px 25px rgba(108,92,231,.4);transform:translateY(-1px)}
    .btn-g{background:transparent;color:var(--t2);border:1px solid var(--border)}
    .btn-g:hover{background:rgba(255,255,255,.05);color:var(--t1);border-color:var(--border2)}
    .btn-s{padding:6px 14px;font-size:12px;border-radius:var(--rxs)}

    /* Input */
    .inp{width:100%;padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);color:var(--t1);font-family:inherit;font-size:14px;transition:all .2s;outline:none}
    .inp:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
    .inp::placeholder{color:var(--t3)}
    .sel{appearance:none;width:100%;padding:12px 40px 12px 16px;background:var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2355556a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat left 16px center;border:1px solid var(--border);border-radius:var(--rs);color:var(--t1);font-family:inherit;font-size:14px;transition:all .2s;outline:none;cursor:pointer}
    .sel:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
    .fg{margin-bottom:16px}
    .fl{display:block;margin-bottom:8px;font-size:13px;font-weight:500;color:var(--t2)}

    /* Grid */
    .g{display:grid;gap:16px}.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}

    /* Section */
    .sec{font-size:13px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .sec::after{content:'';flex:1;height:1px;background:linear-gradient(to left,var(--border),transparent)}

    /* Anim */
    @keyframes fiu{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    .ain{animation:fiu .5s cubic-bezier(.16,1,.3,1) forwards}
    @keyframes pd{0%,100%{opacity:1}50%{opacity:.4}}
    .pd{animation:pd 2s ease-in-out infinite}

    /* Empty */
    .emp{text-align:center;padding:48px 24px;color:var(--t3)}
    .emp-i{font-size:48px;margin-bottom:16px;opacity:.3}

    /* Toast */
    .toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);padding:12px 24px;border-radius:var(--rs);font-size:14px;font-weight:600;z-index:1000;transition:transform .4s cubic-bezier(.16,1,.3,1);pointer-events:none}
    .toast.show{transform:translateX(-50%) translateY(0);pointer-events:auto}
    .toast-ok{background:var(--ok);color:#000}.toast-er{background:var(--err);color:#fff}

    /* Mobile Cards */
    .mc{display:none}
    .cr{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:10px}
    .cr-t{font-weight:700;color:var(--t1);font-size:15px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}
    .cr-f{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,.03)}
    .cr-f:last-child{border-bottom:none}
    .cr-l{color:var(--t3)}.cr-v{color:var(--t2);font-weight:500}

    @media(max-width:1024px){.g4,.g3{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:768px){
      .sb{transform:translateX(calc(100% + 24px));top:8px;bottom:8px;right:8px;width:calc(100% - 16px);max-width:320px;border-radius:20px}
      .sb.open{transform:translateX(0)}
      .main{margin-right:0;padding:16px 16px 100px 16px}
      .bn{display:block}
      .g4,.g3,.g2{grid-template-columns:1fr}
      .do{display:none!important}.mc{display:block}.tw{display:none}
      .cd-h,.cd-b{padding:16px}.st{padding:16px}
      .sti{width:40px;height:40px;border-radius:12px;font-size:18px;margin-bottom:12px}
      h1{font-size:20px!important}
      .sec{font-size:11px}
      .fr{grid-template-columns:1fr!important}
    }
    @media(max-width:380px){.main{padding:0 12px 96px 12px}.st{padding:14px}}
  </style>
</head>
<body>
  <div class="mt"><h1 style="font-size:16px;font-weight:800;background:linear-gradient(135deg,#a29bfe,#6c5ce7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">VorteX Panel</h1></div>
  <div class="ov" id="ov" onclick="closeSb()"></div>
  <div class="app">
    <aside class="sb" id="sb">
      <!-- Logo -->
      <div class="sb-hd">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,#6c5ce7,#a855f7);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(108,92,231,.45),0 0 0 3px rgba(108,92,231,.15);flex-shrink:0;position:relative;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span style="position:absolute;top:-2px;left:-2px;width:12px;height:12px;background:var(--ok);border-radius:50%;border:2px solid #0c0c1a;"></span>
          </div>
          <div>
            <div style="font-size:18px;font-weight:900;background:linear-gradient(135deg,#e8e8ff,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.5px;">VorteX</div>
            <div style="font-size:11px;color:#5a5a7a;margin-top:3px;font-weight:500;">پنل مدیریت ربات VPN</div>
          </div>
        </div>
      </div>

      <!-- Section Label -->
      <div style="padding:20px 20px 8px;font-size:10px;font-weight:700;color:#4a4a6a;text-transform:uppercase;letter-spacing:1.5px;display:flex;align-items:center;gap:8px;">
        <span>منوی اصلی</span>
        <span style="flex:1;height:1px;background:linear-gradient(to left,rgba(108,92,231,.15),transparent);"></span>
      </div>

      <!-- Nav -->
      <nav class="sb-nav">${navHtml}</nav>

      <!-- Footer -->
      <div class="sb-ft">
        <!-- Status -->
        <div style="background:rgba(0,210,160,.06);border:1px solid rgba(0,210,160,.12);border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);flex-shrink:0;"></span>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--ok);">بات فعال</div>
            <div style="font-size:10px;color:#5a5a7a;margin-top:1px;">متصل و در حال کار</div>
          </div>
        </div>

        <!-- Logout -->
        <a href="/logout" style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:12px;font-size:13px;font-weight:500;color:#6a6a8a;text-decoration:none;border:1px solid transparent;transition:all .25s ease;margin-bottom:4px;"
          onmouseenter="this.style.background='rgba(255,107,107,.06)';this.style.color='#ff6b6b';this.style.borderColor='rgba(255,107,107,.12)';"
          onmouseleave="this.style.background='';this.style.color='#6a6a8a';this.style.borderColor='transparent';">
          <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(255,107,107,.06);flex-shrink:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </span>
          <span>خروج از پنل</span>
        </a>
      </div>
    </aside>
    <main class="main">${bodyHtml}</main>
  </div>
  <nav class="bn"><div class="bn-in">${bottomNavHtml}</div></nav>
  <div class="toast" id="toast"></div>
  <script>
    function toggleSb(){const s=document.getElementById('sb'),o=document.getElementById('ov');const isOpen=s.classList.toggle('open');o.style.display=isOpen?'block':'none';requestAnimationFrame(()=>{o.classList.toggle('on',isOpen)});document.body.style.overflow=isOpen?'hidden':''}
    function closeSb(){const s=document.getElementById('sb'),o=document.getElementById('ov');s.classList.remove('open');o.classList.remove('on');document.body.style.overflow='';setTimeout(()=>{o.style.display='none'},300)}
    function showToast(m,t='ok'){const e=document.getElementById('toast');e.textContent=m;e.className='toast toast-'+t+' show';setTimeout(()=>e.classList.remove('show'),3000)}
    document.querySelectorAll('.ain').forEach((el,i)=>{el.style.animationDelay=(i*.06)+'s'});
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  const err = req.query.error ? '<div style="background:var(--err-bg);border:1px solid rgba(255,107,107,.2);color:var(--err);padding:12px 16px;border-radius:var(--rs);font-size:13px;margin-bottom:20px;">رمز عبور صحیح نیست</div>' : '';
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="theme-color" content="#07070e">
  <title>ورود · VorteX</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Vazirmatn',sans-serif;background:#07070e;color:#f0f0f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden}
    body::before{content:'';position:absolute;top:-200px;right:-200px;width:500px;height:500px;background:radial-gradient(circle,rgba(108,92,231,.15),transparent 70%);border-radius:50%}
    body::after{content:'';position:absolute;bottom:-200px;left:-200px;width:500px;height:500px;background:radial-gradient(circle,rgba(168,85,247,.1),transparent 70%);border-radius:50%}
    .lc{width:100%;max-width:400px;position:relative;z-index:1}
    .ll{text-align:center;margin-bottom:40px}
    .lb{width:72px;height:72px;background:linear-gradient(135deg,#6c5ce7,#a855f7);border-radius:22px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(108,92,231,.4);margin-bottom:20px}
    .bx{background:#111120;border:1px solid #1e1e3a;border-radius:20px;padding:32px}
    .lt{font-size:22px;font-weight:800;margin-bottom:6px;background:linear-gradient(135deg,#f0f0f8,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .ls{font-size:14px;color:#55556a;margin-bottom:28px}
    .li{width:100%;padding:14px 18px;background:#07070e;border:1px solid #1e1e3a;border-radius:12px;color:#f0f0f8;font-family:inherit;font-size:15px;outline:none;transition:all .2s;margin-bottom:20px}
    .li:focus{border-color:#6c5ce7;box-shadow:0 0 0 3px rgba(108,92,231,.2)}
    .li::placeholder{color:#55556a}
    .btn{width:100%;padding:14px;background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s;box-shadow:0 4px 20px rgba(108,92,231,.3)}
    .btn:hover{box-shadow:0 6px 30px rgba(108,92,231,.4);transform:translateY(-1px)}
    .btn:active{transform:scale(.98)}
  </style>
</head>
<body>
  <div class="lc">
    <div class="ll">
      <div class="lb"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
      <div class="lt">ورود به پنل</div>
      <div class="ls">برای مدیریت ربات VorteX وارد شوید</div>
    </div>
    <div class="bx">
      <form method="POST" action="/login">
        ${err}
        <input type="password" name="password" class="li" placeholder="رمز عبور پنل" required autofocus>
        <button type="submit" class="btn">ورود</button>
      </form>
    </div>
  </div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) { req.session.authenticated = true; return res.redirect('/'); }
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
app.get('/', auth, (req, res) => {
  const u = botState ? botState.seenUsers.size : 0;
  const o = botState ? botState.userInvoices.size : 0;
  const p = botState ? botState.awaitingReceipts.size : 0;
  const ch = botState ? botState.getChannelUsername() : 'N/A';

  let pendT = '<div class="emp"><div class="emp-i">✅</div><p>رسید در انتظاری نیست</p></div>';
  let pendC = pendT;
  if (botState && botState.awaitingReceipts.size > 0) {
    const en = [...botState.awaitingReceipts.entries()];
    pendT = `<div class="tw"><table><thead><tr><th>کاربر</th><th>سرور</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>${en.map(([id,d])=>`<tr><td style="font-family:monospace;color:var(--t1)">${id}</td><td>${d.serverName||'-'}</td><td style="color:var(--warn);font-weight:700">${d.amount?d.amount.toLocaleString('fa-IR')+' ت':'-'}</td><td><span class="bdg bdg-w">⏳ منتظر</span></td></tr>`).join('')}</tbody></table></div>`;
    pendC = en.map(([id,d])=>`<div class="cr"><div class="cr-t"><span style="font-family:monospace">${id}</span><span class="bdg bdg-w">⏳</span></div><div class="cr-f"><span class="cr-l">سرور</span><span class="cr-v">${d.serverName||'-'}</span></div><div class="cr-f"><span class="cr-l">مبلغ</span><span class="cr-v" style="color:var(--warn)">${d.amount?d.amount.toLocaleString('fa-IR')+' ت':'-'}</span></div></div>`).join('');
  }

  let recT = '<div class="emp"><div class="emp-i">📦</div><p>هنوز سفارشی ثبت نشده</p></div>';
  let recC = recT;
  if (botState && botState.userInvoices.size > 0) {
    const en = [...botState.userInvoices.entries()].slice(-8).reverse();
    recT = `<div class="tw"><table><thead><tr><th>کاربر</th><th>نام</th><th>سرور</th><th>حجم</th><th>زمان</th><th>مبلغ</th></tr></thead><tbody>${en.map(([id,v])=>`<tr><td style="font-family:monospace;color:var(--t1)">${id}</td><td style="color:var(--t1)">${v.userName||'-'}</td><td>${v.serverName||'-'}</td><td>${v.volumeLabel||'-'}</td><td>${v.timeLabel||'-'}</td><td style="color:var(--ok);font-weight:700">${v.amount?v.amount.toLocaleString('fa-IR')+' ت':'-'}</td></tr>`).join('')}</tbody></table></div>`;
    recC = en.map(([id,v])=>`<div class="cr"><div class="cr-t"><span>${v.userName||'کاربر'}</span><span style="font-family:monospace;font-size:12px;color:var(--t3)">#${id}</span></div><div class="cr-f"><span class="cr-l">سرور</span><span class="cr-v">${v.serverName||'-'}</span></div><div class="cr-f"><span class="cr-l">حجم</span><span class="cr-v">${v.volumeLabel||'-'}</span></div><div class="cr-f"><span class="cr-l">زمان</span><span class="cr-v">${v.timeLabel||'-'}</span></div><div class="cr-f"><span class="cr-l">مبلغ</span><span class="cr-v" style="color:var(--ok);font-weight:700">${v.amount?v.amount.toLocaleString('fa-IR')+' ت':'-'}</span></div></div>`).join('');
  }

  const c = `
    <div class="ain" style="margin-bottom:28px"><h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px">داشبورد</h1><p style="color:var(--t3);font-size:14px;margin-top:6px">نمای کلی وضعیت ربات و فعالیت‌ها</p></div>
    <div class="g g4 ain" style="margin-bottom:24px">
      <div class="st i"><div class="sti i">👥</div><div style="font-size:28px;font-weight:900;color:var(--t1);line-height:1">${u}</div><div style="font-size:12px;color:var(--t3);margin-top:8px">کل کاربران</div></div>
      <div class="st g"><div class="sti g">📦</div><div style="font-size:28px;font-weight:900;color:var(--t1);line-height:1">${o}</div><div style="font-size:12px;color:var(--t3);margin-top:8px">کل سفارشات</div></div>
      <div class="st a"><div class="sti a">⏳</div><div style="font-size:28px;font-weight:900;color:var(--t1);line-height:1">${p}</div><div style="font-size:12px;color:var(--t3);margin-top:8px">در انتظار رسید</div></div>
      <div class="st b"><div class="sti b">📢</div><div style="font-size:16px;font-weight:700;color:var(--t1);margin-top:8px;line-height:1.3">${ch.replace('@','')}</div><div style="font-size:12px;color:var(--t3);margin-top:8px">کانال فعال</div></div>
    </div>
    <div class="sec ain">اطلاعات سریع</div>
    <div class="g g3 ain" style="margin-bottom:28px">
      <div class="st"><div style="font-size:12px;color:var(--t3);margin-bottom:8px">💳 شماره کارت</div><div style="font-size:16px;font-weight:700;font-family:monospace;letter-spacing:1px">${CARD_NUMBER||'—'}</div></div>
      <div class="st"><div style="font-size:12px;color:var(--t3);margin-bottom:8px">📢 عضویت کانال</div><div style="font-size:14px;font-weight:700">${botState&&botState.getMembershipRequired()?'<span class="bdg bdg-ok">فعال</span>':'<span class="bdg bdg-m">غیرفعال</span>'}</div></div>
      <div class="st"><div style="font-size:12px;color:var(--t3);margin-bottom:8px">🔌 مرزبان</div><div style="font-size:14px;font-weight:700">${MARZBAN_URL?'<span class="bdg bdg-ok">متصل</span>':'<span class="bdg bdg-e">تنظیم نشده</span>'}</div></div>
    </div>
    ${botState&&botState.awaitingReceipts.size>0?`<div class="cd ain" style="margin-bottom:24px;border-color:rgba(254,202,87,.15)"><div class="cd-h" style="border-color:rgba(254,202,87,.1)"><div><div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--warn)"></span>رسیدهای در انتظار</div><div style="font-size:12px;color:var(--t3);margin-top:4px">${botState.awaitingReceipts.size} رسید منتظر تأیید</div></div></div><div class="cd-b" style="padding:0">${pendT}</div></div><div class="mc ain" style="margin-bottom:24px">${pendC}</div>`:''}
    <div class="cd ain"><div class="cd-h"><div style="font-size:16px;font-weight:700">آخرین سفارشات</div><a href="/orders" class="btn btn-g btn-s" style="text-decoration:none">مشاهده همه ←</a></div><div class="cd-b" style="padding:0">${recT}</div></div>
    <div class="mc ain" style="margin-top:16px">${recC}</div>`;
  res.send(layout('داشبورد','/',c));
});

// ═══════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════
app.get('/orders', auth, (req, res) => {
  let oT='',oC='';
  if (botState&&botState.userInvoices.size>0) {
    const en=[...botState.userInvoices.entries()].reverse();
    oT=`<div class="tw"><table><thead><tr><th>کاربر</th><th>نام</th><th>سرور</th><th>حجم</th><th>زمان</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${en.map(([id,v])=>{const hp=botState.awaitingReceipts.has(id);return`<tr><td style="font-family:monospace;color:var(--t1)">${id}</td><td style="color:var(--t1)">${v.userName||'-'}</td><td>${v.serverName||'-'}</td><td>${v.volumeLabel||'-'}</td><td>${v.timeLabel||'-'}</td><td style="color:var(--ok);font-weight:700">${v.amount?v.amount.toLocaleString('fa-IR')+' ت':'—'}</td><td>${hp?'<span class="bdg bdg-w">⏳ رسید</span>':'<span class="bdg bdg-i">ثبت شده</span>'}</td><td><button onclick="ne(${id})" class="btn btn-g btn-s">📩 اتمام</button></td></tr>`}).join('')}</tbody></table></div>`;
    oC=en.map(([id,v])=>{const hp=botState.awaitingReceipts.has(id);return`<div class="cr"><div class="cr-t"><span>${v.userName||'کاربر'}</span>${hp?'<span class="bdg bdg-w">⏳ رسید</span>':'<span class="bdg bdg-i">ثبت شده</span>'}</div><div class="cr-f"><span class="cr-l">آیدی</span><span class="cr-v" style="font-family:monospace">${id}</span></div><div class="cr-f"><span class="cr-l">سرور</span><span class="cr-v">${v.serverName||'-'}</span></div><div class="cr-f"><span class="cr-l">حجم</span><span class="cr-v">${v.volumeLabel||'-'}</span></div><div class="cr-f"><span class="cr-l">زمان</span><span class="cr-v">${v.timeLabel||'-'}</span></div><div class="cr-f"><span class="cr-l">مبلغ</span><span class="cr-v" style="color:var(--ok);font-weight:700">${v.amount?v.amount.toLocaleString('fa-IR')+' ت':'—'}</span></div><div style="margin-top:10px"><button onclick="ne(${id})" class="btn btn-g btn-s" style="width:100%">📩 ارسال اعلان اتمام</button></div></div>`}).join('');
  } else { oT=oC='<div class="emp"><div class="emp-i">📦</div><p>هنوز سفارشی ثبت نشده</p></div>'; }

  const c=`<div class="ain" style="margin-bottom:28px"><h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px">سفارشات</h1><p style="color:var(--t3);font-size:14px;margin-top:6px">مدیریت تمام سفارشات ثبت‌شده</p></div>
  <div class="cd ain"><div class="cd-h"><div style="font-size:16px;font-weight:700">همه سفارشات <span style="color:var(--t3);font-size:13px;font-weight:500">(${botState?botState.userInvoices.size:0})</span></div></div><div class="cd-b" style="padding:0">${oT}</div></div>
  <div class="mc ain" style="margin-top:16px">${oC}</div>
  <script>async function ne(uid){if(!confirm('اعلان اتمام سرویس برای کاربر '+uid+' ارسال شود؟'))return;try{const r=await fetch('/api/notify-expire/'+uid,{method:'POST'});const d=await r.json();showToast(d.message||'انجام شد','ok')}catch(e){showToast('خطا در ارسال','er')}}</script>`;
  res.send(layout('سفارشات','/orders',c));
});

// ═══════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════
app.get('/users', auth, (req, res) => {
  let uT='',uC='';
  if (botState&&botState.seenUsers.size>0) {
    const ids=[...botState.seenUsers];
    uT=`<div class="tw"><table><thead><tr><th>آیدی عددی</th><th>نام</th><th>نوع</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${ids.map(id=>{const inv=botState.userInvoices.get(id);const hp=botState.awaitingReceipts.has(id);return`<tr><td style="font-family:monospace;color:var(--t1)">${id}</td><td style="color:var(--t1)">${inv?(inv.userName||'-'):'-'}</td><td>${inv?'<span class="bdg bdg-ok">خریدار</span>':'<span class="bdg bdg-m">بازدیدکننده</span>'}</td><td>${hp?'<span class="bdg bdg-w">رسید در انتظار</span>':inv?'<span class="bdg bdg-ac">سفارش ثبت‌شده</span>':'<span class="bdg bdg-m">بدون سفارش</span>'}</td><td><a href="https://t.me/${id}" target="_blank" style="color:var(--accent2);text-decoration:none;font-size:13px">پیام →</a></td></tr>`}).join('')}</tbody></table></div>`;
    uC=ids.map(id=>{const inv=botState.userInvoices.get(id);const hp=botState.awaitingReceipts.has(id);return`<div class="cr"><div class="cr-t"><span>${inv?(inv.userName||'کاربر'):'بازدیدکننده'}</span>${inv?'<span class="bdg bdg-ok">خریدار</span>':'<span class="bdg bdg-m">بازدید</span>'}</div><div class="cr-f"><span class="cr-l">آیدی</span><span class="cr-v" style="font-family:monospace">${id}</span></div><div class="cr-f"><span class="cr-l">وضعیت</span><span class="cr-v">${hp?'رسید در انتظار':inv?'سفارش ثبت‌شده':'بدون سفارش'}</span></div><div style="margin-top:10px"><a href="https://t.me/${id}" target="_blank" class="btn btn-g btn-s" style="width:100%;text-decoration:none">پیام به کاربر →</a></div></div>`}).join('');
  } else { uT=uC='<div class="emp"><div class="emp-i">👥</div><p>هنوز کاربری وارد ربات نشده</p></div>'; }

  const c=`<div class="ain" style="margin-bottom:28px"><h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px">کاربران</h1><p style="color:var(--t3);font-size:14px;margin-top:6px">${botState?botState.seenUsers.size:0} کاربر ثبت‌شده</p></div>
  <div class="cd ain"><div class="cd-b" style="padding:0">${uT}</div></div>
  <div class="mc ain" style="margin-top:16px">${uC}</div>`;
  res.send(layout('کاربران','/users',c));
});

// ═══════════════════════════════════════════
//  MARZBAN
// ═══════════════════════════════════════════
app.get('/marzban', auth, async (req, res) => {
  let mu=[],error=null;
  if (!botState||!MARZBAN_URL||!MARZBAN_USERNAME||!MARZBAN_PASSWORD) {
    error='تنظیمات مرزبان در متغیرهای محیطی تعریف نشده‌اند.';
  } else {
    try {
      const tk=await botState.getMarzbanToken();
      if(!tk.ok){error='خطا در اتصال: '+(tk.error||'نامشخص');}
      else{
        const fetch=require('node-fetch');
        const base=MARZBAN_URL.replace(/\/dashboard\/?$/,'').replace(/\/$/,'');
        let r=null;
        for(const ep of['/api/admin/users','/api/admin/user','/api/users']){
          r=await fetch(`${base}${ep}?offset=0&limit=100`,{headers:{Authorization:`Bearer ${tk.token}`}});
          if(r.ok)break;
        }
        if(r&&r.ok){const d=await r.json();mu=d.users||d||[];if(!Array.isArray(mu))mu=[];}
        else{error=`خطا در دریافت لیست: ${r?r.status:'نامشخص'}`;}
      }
    }catch(e){error='خطا در ارتباط: '+e.message;}
  }

  let mT='',mC='';
  if(error){mT=mC=`<div class="emp"><div class="emp-i">⚠️</div><p style="color:var(--err)">${error}</p></div>`;}
  else if(mu.length===0){mT=mC='<div class="emp"><div class="emp-i">🔌</div><p>کاربری در مرزبان یافت نشد</p></div>';}
  else{
    mT=`<div class="tw"><table><thead><tr><th>یوزرنیم</th><th>مصرف / حجم</th><th>انقضا</th><th>وضعیت</th><th>پروتکل</th><th>لینک</th></tr></thead><tbody>${mu.map(u=>{const dl=u.data_limit?(u.data_limit/(1024**3)).toFixed(1):'∞';const ul=u.used_traffic?(u.used_traffic/(1024**3)).toFixed(1):'0';const ex=u.expire?new Date(u.expire*1000).toLocaleDateString('fa-IR'):'∞';const on=u.is_active!==false&&(!u.expire||u.expire*1000>Date.now());return`<tr><td style="font-family:monospace;color:var(--t1);font-size:13px">${u.username||'-'}</td><td><span style="color:${parseFloat(ul)>parseFloat(dl)*.8?'var(--err)':'var(--t1)'}">${ul}</span> / ${dl} گیگ</td><td>${ex}</td><td>${on?'<span class="bdg bdg-ok">فعال</span>':'<span class="bdg bdg-e">غیرفعال</span>'}</td><td style="font-size:12px">${u.proxies?Object.keys(u.proxies).map(p=>p.toUpperCase()).join(', '):'-'}</td><td>${u.subscription_url?`<a href="${u.subscription_url}" target="_blank" style="color:var(--accent2);text-decoration:none;font-size:13px">لینک →</a>`:'—'}</td></tr>`}).join('')}</tbody></table></div>`;
    mC=mu.map(u=>{const dl=u.data_limit?(u.data_limit/(1024**3)).toFixed(1):'∞';const ul=u.used_traffic?(u.used_traffic/(1024**3)).toFixed(1):'0';const ex=u.expire?new Date(u.expire*1000).toLocaleDateString('fa-IR'):'∞';const on=u.is_active!==false&&(!u.expire||u.expire*1000>Date.now());return`<div class="cr"><div class="cr-t"><span style="font-family:monospace;font-size:14px">${u.username||'-'}</span>${on?'<span class="bdg bdg-ok">فعال</span>':'<span class="bdg bdg-e">غیرفعال</span>'}</div><div class="cr-f"><span class="cr-l">مصرف</span><span class="cr-v">${ul} / ${dl} گیگ</span></div><div class="cr-f"><span class="cr-l">انقضا</span><span class="cr-v">${ex}</span></div><div class="cr-f"><span class="cr-l">پروتکل</span><span class="cr-v">${u.proxies?Object.keys(u.proxies).map(p=>p.toUpperCase()).join(', '):'-'}</span></div>${u.subscription_url?`<div style="margin-top:10px"><a href="${u.subscription_url}" target="_blank" class="btn btn-g btn-s" style="width:100%;text-decoration:none">🔗 لینک اشتراک</a></div>`:''}</div>`}).join('');
  }

  const c=`<div class="ain" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:28px"><div><h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px">مرزبان</h1><p style="color:var(--t3);font-size:14px;margin-top:6px">مدیریت کاربران VPN</p></div><div style="display:flex;gap:8px;align-items:center">${MARZBAN_URL?'<span class="bdg bdg-ok">● متصل</span>':'<span class="bdg bdg-e">● قطع</span>'}<a href="/marzban" class="btn btn-g btn-s" style="text-decoration:none">🔄 بروزرسانی</a></div></div>
  <div class="cd ain"><div class="cd-h"><div style="font-size:16px;font-weight:700">کاربران VPN <span style="color:var(--t3);font-size:13px;font-weight:500">(${mu.length})</span></div></div><div class="cd-b" style="padding:0">${mT}</div></div>
  <div class="mc ain" style="margin-top:16px">${mC}</div>`;
  res.send(layout('مرزبان','/marzban',c));
});

// ═══════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════
app.get('/settings', auth, (req, res) => {
  const c=`<div class="ain" style="margin-bottom:28px"><h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px">تنظیمات</h1><p style="color:var(--t3);font-size:14px;margin-top:6px">پیکربندی ربات، قیمت‌ها و اتصالات</p></div>
  <form id="sf" class="ain">
    <div class="sec">💰 قیمت‌ها</div>
    <div class="cd" style="margin-bottom:24px"><div class="cd-b"><div class="fr" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div class="fg"><label class="fl">قیمت ۲۰ گیگ (تومان)</label><input type="number" name="price_20" class="inp" value="${process.env.ALL_SERVERS_PRICE_20||''}" placeholder="مثلاً 60000"></div>
      <div class="fg"><label class="fl">قیمت ۱۰ گیگ (تومان)</label><input type="number" name="price_10" class="inp" value="${process.env.ALL_SERVERS_PRICE_10||''}" placeholder="مثلاً 40000"></div>
      <div class="fg"><label class="fl">قیمت ۵ گیگ (تومان)</label><input type="number" name="price_5" class="inp" value="${process.env.ALL_SERVERS_PRICE_5||''}" placeholder="مثلاً 20000"></div>
    </div></div></div>

    <div class="sec">💳 پرداخت و کانال</div>
    <div class="cd" style="margin-bottom:24px"><div class="cd-b"><div class="fr" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
      <div class="fg"><label class="fl">شماره کارت</label><input type="text" name="card_number" class="inp" value="${CARD_NUMBER}" placeholder="0000-0000-0000-0000" style="font-family:monospace;letter-spacing:1px"></div>
      <div class="fg"><label class="fl">نام کانال</label><input type="text" name="channel" class="inp" value="${botState?botState.getChannelUsername():''}" placeholder="@channel_name"></div>
      <div class="fg"><label class="fl">عضویت اجباری</label><select name="membership_required" class="sel"><option value="true" ${botState&&botState.getMembershipRequired()?'selected':''}>فعال</option><option value="false" ${botState&&!botState.getMembershipRequired()?'selected':''}>غیرفعال</option></select></div>
      <div class="fg"><label class="fl">آیدی ادمین</label><input type="text" name="admin_id" class="inp" value="${process.env.ADMIN_ID||''}" placeholder="123456789"></div>
    </div></div></div>

    <div class="sec">🔌 مرزبان</div>
    <div class="cd" style="margin-bottom:24px"><div class="cd-b"><div class="fr" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div class="fg"><label class="fl">آدرس پنل</label><input type="text" name="marzban_url" class="inp" value="${MARZBAN_URL}" placeholder="https://panel.com/dashboard" style="font-size:13px"></div>
      <div class="fg"><label class="fl">یوزرنیم</label><input type="text" name="marzban_username" class="inp" value="${MARZBAN_USERNAME}" placeholder="admin"></div>
      <div class="fg"><label class="fl">پسورد</label><input type="password" name="marzban_password" class="inp" value="${MARZBAN_PASSWORD}" placeholder="••••••••"></div>
    </div></div></div>

    <div class="sec">🔒 امنیت پنل</div>
    <div class="cd" style="margin-bottom:32px"><div class="cd-b"><div class="fr" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
      <div class="fg"><label class="fl">رمز عبور پنل</label><input type="password" name="admin_password" class="inp" value="${ADMIN_PASSWORD}" placeholder="رمز جدید"></div>
    </div></div></div>

    <div class="sec">📦 مدیریت دیتابیس</div>
    <div class="cd" style="margin-bottom:32px"><div class="cd-b">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
        <button type="button" onclick="downloadDB()" class="btn btn-g" style="gap:6px">⬇️ دانلود دیتابیس</button>
        <label class="btn btn-g" style="gap:6px;cursor:pointer;margin:0">
          ⬆️ انتخاب فایل دیتابیس
          <input type="file" id="dbFile" accept=".db" style="display:none" onchange="uploadDB(this)">
        </label>
      </div>
      <div style="margin-top:12px;padding:12px 16px;background:rgba(254,202,87,.06);border:1px solid rgba(254,202,87,.12);border-radius:10px;font-size:12px;color:var(--warn);line-height:1.8;">
        ⚠️ <b>نکته مهاجرت:</b> برای انتقال بات به حساب Railway دیگر:<br>
        ۱. ابتدا «دانلود دیتابیس» رو بزنید و فایل رو ذخیره کنید<br>
        ۲. پروژه جدید روی Railway بسازید و متغیرها رو تنظیم کنید<br>
        ۳. فایل دیتابیس دانلود شده رو در بخش بالا آپلود کنید<br>
        ۴. ربات ری‌استارت می‌شود و تمام اطلاعات قبلی برگشته
      </div>
    </div></div>

    <div style="display:flex;justify-content:flex-end;gap:12px">
      <button type="submit" class="btn btn-p" style="padding:12px 32px">💾 ذخیره تنظیمات</button>
    </div>
  </form>
  <script>
    document.getElementById('sf').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target);const d=Object.fromEntries(fd);try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(r.ok)showToast('تنظیمات ذخیره شد ✅','ok');else showToast('خطا در ذخیره','er')}catch(err){showToast('خطا در ارتباط','er')}});

    function downloadDB(){
      window.location.href='/api/backup';
    }

    async function uploadDB(input){
      const file=input.files[0];
      if(!file)return;
      if(!confirm('⚠️ دیتابیس فعلی جایگزین می‌شود! مطمئنید؟')){input.value='';return;}
      showToast('در حال آپلود...','ok');
      try{
        const res=await fetch('/api/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
        const data=await res.json();
        if(res.ok){showToast(data.message,'ok');setTimeout(()=>location.reload(),3000);}
        else showToast(data.error||'خطا','er');
      }catch(e){showToast('خطا در آپلود','er');}
      input.value='';
    }
  </script>`;
  res.send(layout('تنظیمات','/settings',c));
});

// ═══════════════════════════════════════════
//  API
// ═══════════════════════════════════════════
app.post('/api/notify-expire/:userId', auth, async (req, res) => {
  const uid=Number(req.params.userId);
  if(!uid||!botState)return res.json({message:'خطا'});
  try{
    await botState.bot.sendMessage(uid,'کاربر عزیز، سرویست به پایان رسیده. برای تمدید روی دکمه بزن.',{reply_markup:{inline_keyboard:[[{text:'تمدید 🔁',callback_data:`renew_all_${uid}`}]]}});
    res.json({message:'اعلان ارسال شد ✅'});
  }catch(e){res.json({message:'خطا: '+e.message});}
});

app.post('/api/settings', auth, (req, res) => {
  res.json({message:'بروزرسانی شد. برای تغییرات دائمی Railway رو ویرایش کنید.'});
});

app.get('/api/stats', auth, (req, res) => {
  if(!botState)return res.json({users:0,orders:0,pending:0});
  res.json({users:botState.seenUsers.size,orders:botState.userInvoices.size,pending:botState.awaitingReceipts.size,channel:botState.getChannelUsername()});
});

// ═══ BACKUP / RESTORE ═══
const dbModule = require('./database');

app.get('/api/backup', auth, (req, res) => {
  const buf = dbModule.getFileBuffer();
  if (!buf) return res.status(404).json({ error: 'فایل داده پیدا نشد' });
  const date = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Disposition', `attachment; filename="vortex-backup-${date}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(buf);
});

app.post('/api/restore', auth, (req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      const text = buf.toString('utf-8');
      // Validate JSON
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid');
      // Write file
      dbModule.writeFileBuffer(buf);
      // Reload state
      if (botState && botState.reloadState) botState.reloadState();
      const userCount = Object.keys(parsed.users || {}).length;
      const invoiceCount = Object.keys(parsed.invoices || {}).length;
      res.json({ message: `دیتابیس بازیابی شد ✅ (${userCount} کاربر، ${invoiceCount} سفارش)` });
    } catch (e) {
      res.status(400).json({ error: 'فایل معتبر نیست یا JSON نیست' });
    }
  });
  req.on('error', () => res.status(500).json({ error: 'خطا در آپلود' }));
});

app.get('/health', (req, res) => {
  res.json({status:'ok',bot:botState?'running':'not loaded',uptime:process.uptime()});
});

// ═══════════════════════════════════════════
//  START
// ═══════════════════════════════════════════
function startServer(exports) {
  botState = exports;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🌐 VorteX Panel: http://0.0.0.0:${PORT}`);
    console.log(`  🔑 Password: ${ADMIN_PASSWORD}\n`);
  });
}

module.exports = { startServer };
