import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { html, raw } from 'hono/html';

const app = new Hono();

// ── Crypto helpers ──────────────────────────────────────────────────────────

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function generateSalt() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

async function signCookie(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = JSON.stringify(payload);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${btoa(data)}.${sigB64}`;
}

async function verifyCookie(cookie, secret) {
  if (!cookie) return null;
  try {
    const [dataB64, sigB64] = cookie.split('.');
    if (!dataB64 || !sigB64) return null;
    const data = atob(dataB64);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(data));
    return valid ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// ── Session middleware ───────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const secret = c.env.SESSION_SECRET || 'dev-secret-change-in-prod';
  const sessionCookie = getCookie(c, 'session');
  c.set('user', await verifyCookie(sessionCookie, secret));
  await next();
});

function requireAuth(c) {
  const user = c.get('user');
  if (!user) return c.redirect('/login');
  return null;
}

// ── HTML Templates ──────────────────────────────────────────────────────────

const CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #15202b; color: #d9d9d9; min-height: 100vh; }
.container { max-width: 600px; margin: 0 auto; padding: 0 16px; }
.navbar { background: #192734; border-bottom: 1px solid #38444d; padding: 12px 24px; display: flex; align-items: center; gap: 24px; position: sticky; top: 0; z-index: 10; }
.logo { color: #1da1f2; font-size: 1.4rem; font-weight: 800; text-decoration: none; }
.nav-links { display: flex; gap: 16px; }
.nav-links a { color: #8899a6; text-decoration: none; font-size: 0.95rem; }
.nav-links a:hover { color: #1da1f2; }
.nav-user { margin-left: auto; color: #8899a6; font-size: 0.9rem; }
.auth-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.auth-page h1 { color: #1da1f2; font-size: 2rem; margin-bottom: 24px; }
.auth-form { width: 100%; max-width: 380px; }
.auth-form input { width: 100%; padding: 12px 16px; margin-bottom: 12px; background: #192734; border: 1px solid #38444d; border-radius: 6px; color: #d9d9d9; font-size: 1rem; }
.auth-form input:focus { outline: none; border-color: #1da1f2; }
.auth-form button { width: 100%; }
.auth-form .link { text-align: center; margin-top: 16px; }
.auth-form .link a { color: #1da1f2; text-decoration: none; }
.error { color: #e0245e; margin-bottom: 12px; text-align: center; }
.btn { padding: 10px 20px; border: none; border-radius: 9999px; background: #1da1f2; color: #fff; font-weight: 700; cursor: pointer; font-size: 0.95rem; }
.btn:hover { background: #1a91da; }
.btn-outline { background: transparent; border: 1px solid #1da1f2; color: #1da1f2; }
.btn-outline:hover { background: rgba(29,161,242,0.1); }
.btn-sm { padding: 6px 14px; font-size: 0.85rem; }
.compose { border-bottom: 1px solid #38444d; padding: 16px 0; }
.compose textarea { width: 100%; min-height: 80px; padding: 12px; background: transparent; border: none; color: #d9d9d9; font-size: 1.1rem; resize: vertical; }
.compose textarea:focus { outline: none; }
.compose-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #38444d; }
.char-count { color: #8899a6; font-size: 0.85rem; }
.tweet { padding: 16px 0; border-bottom: 1px solid #38444d; }
.tweet-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.tweet-author { font-weight: 700; color: #fff; text-decoration: none; }
.tweet-author:hover { text-decoration: underline; }
.tweet-handle { color: #8899a6; font-size: 0.9rem; }
.tweet-time { color: #8899a6; font-size: 0.85rem; margin-left: auto; }
.tweet-content { line-height: 1.5; margin-bottom: 10px; white-space: pre-wrap; word-break: break-word; }
.tweet-actions { display: flex; gap: 24px; }
.tweet-actions form { display: inline; }
.tweet-actions button { background: none; border: none; color: #8899a6; cursor: pointer; font-size: 0.9rem; }
.tweet-actions button:hover { color: #e0245e; }
.tweet-actions .liked { color: #e0245e; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.badge-flagged { background: rgba(255,173,31,0.2); color: #ffad1f; }
.badge-unmoderated { background: rgba(136,153,166,0.2); color: #8899a6; }
.flag-info { background: rgba(255,173,31,0.08); border: 1px solid rgba(255,173,31,0.3); border-radius: 8px; padding: 10px 14px; margin-top: 8px; font-size: 0.85rem; color: #ffad1f; line-height: 1.5; }
.flag-info strong { color: #fff; }
.flag-info .flag-detail { margin-top: 6px; color: #ccc; font-size: 0.82rem; }
.blocked-notice { background: rgba(224,36,94,0.1); border: 1px solid rgba(224,36,94,0.3); border-radius: 8px; padding: 12px 16px; margin: 12px 0; color: #e0245e; }
.profile-header { padding: 24px 0; border-bottom: 1px solid #38444d; }
.profile-header h2 { font-size: 1.3rem; color: #fff; }
.profile-stats { display: flex; gap: 20px; margin-top: 8px; color: #8899a6; font-size: 0.9rem; }
.profile-stats strong { color: #fff; }
.profile-actions { margin-top: 12px; }
.mod-header { padding: 20px 0; border-bottom: 1px solid #38444d; }
.mod-header h2 { color: #ffad1f; }
.mod-tweet { padding: 16px 0; border-bottom: 1px solid #38444d; }
.mod-details { margin-top: 8px; font-size: 0.85rem; color: #8899a6; }
.empty-state { text-align: center; padding: 40px 0; color: #8899a6; }
.tier1-blocked { opacity: 0.3; pointer-events: none; position: relative; }
.tier1-blocked::after { content: "Hidden by moderation"; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); color: #e0245e; font-weight: 700; font-size: 0.9rem; pointer-events: none; }`;

function layout(user, body) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chirp</title>
  <style>${raw(CSS)}</style>
</head>
<body>
  ${user ? html`
  <nav class="navbar">
    <a href="/" class="logo">Chirp</a>
    <div class="nav-links">
      <a href="/">Timeline</a>
      <a href="/user/${user.username}">Profile</a>
      <a href="/moderation">Moderation</a>
      <a href="/logout">Logout</a>
    </div>
    <span class="nav-user">@${user.username}</span>
  </nav>` : ''}
  <main class="container">
    ${body}
  </main>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tweetCard(tweet, currentUserId) {
  const isAuthor = tweet.user_id === currentUserId;
  const date = new Date(tweet.created_at + 'Z').toLocaleDateString();

  // Parse tier2 data for non-authors
  let flagInfo = '';
  if (tweet.moderation_status === 'flagged' && tweet.moderation_tier2 && !isAuthor) {
    try {
      const t2 = JSON.parse(tweet.moderation_tier2);
      if (t2 && t2.issues && t2.issues.length > 0) {
        const issues = t2.issues.map(i => escapeHtml(i)).join(', ');
        const summary = t2.summary ? `<div class="flag-detail">${escapeHtml(t2.summary)}</div>` : '';
        flagInfo = `<div class="flag-info"><strong>Reader context:</strong> This post may contain: ${issues}${summary}</div>`;
      }
    } catch {}
  }

  // Badge: only show to non-authors
  const badge = (tweet.moderation_status === 'flagged' && !isAuthor)
    ? '<span class="badge badge-flagged">Flagged</span>'
    : (tweet.moderation_status === 'unmoderated')
      ? '<span class="badge badge-unmoderated">Unmoderated</span>'
      : '';

  return `<div class="tweet">
    <div class="tweet-header">
      <a href="/user/${escapeHtml(tweet.username)}" class="tweet-author">${escapeHtml(tweet.display_name)}</a>
      <span class="tweet-handle">@${escapeHtml(tweet.username)}</span>
      ${badge}
      <span class="tweet-time">${date}</span>
    </div>
    <div class="tweet-content">${escapeHtml(tweet.content)}</div>
    ${flagInfo}
    <div class="tweet-actions">
      <form method="POST" action="/like/${tweet.id}">
        <button class="${tweet.liked_by_me ? 'liked' : ''}">
          ${tweet.liked_by_me ? '&#9829;' : '&#9825;'} ${tweet.like_count}
        </button>
      </form>
    </div>
  </div>`;
}

// ── Moderation ──────────────────────────────────────────────────────────────

async function callOllama(env, messages) {
  const baseUrl = env.OLLAMA_BASE_URL || 'https://ollama.com';
  const apiKey = env.OLLAMA_API_KEY || '';
  const model = env.OLLAMA_MODEL || 'qwen3';

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Some models (e.g. deepseek) put output in "thinking" field instead of "content"
  return data.message?.content || data.message?.thinking || '';
}

function parseJson(response) {
  const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
  // Try to extract JSON from thinking model output
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return JSON.parse(cleaned);
}

async function tier1Check(env, content) {
  const response = await callOllama(env, [
    {
      role: 'system',
      content: `You are a content moderation system. Analyze the following post for:
- Hate speech, slurs, or bigotry targeting race, ethnicity, gender, sexuality, religion, disability
- Direct personal attacks intended to harm or harass a specific individual
- Direct threats of violence
- Dehumanizing language

Respond with ONLY valid JSON (no markdown, no code fences, no thinking):
{"blocked": true/false, "reason": "brief explanation or null"}`,
    },
    { role: 'user', content },
  ]);

  try {
    return parseJson(response);
  } catch {
    console.error('Tier 1 parse error:', response);
    return { blocked: false, reason: null };
  }
}

async function tier2Check(env, content) {
  const response = await callOllama(env, [
    {
      role: 'system',
      content: `You are an information quality analyst helping readers critically evaluate content. Analyze the following post for:
- Logical fallacies (ad hominem, straw man, false dichotomy, appeal to emotion, slippery slope, red herring, circular reasoning, etc.)
- Manipulation tactics (gaslighting, DARVO, sea-lioning, gish gallop, loaded questions)
- Bad faith argumentation (moving goalposts, whataboutism, arguing in bad faith)
- Information asymmetry exploitation (misleading statistics, cherry-picked data, out-of-context quotes)

For each issue found, explain specifically HOW it appears in the text and what conclusion the reader might be manipulated toward.

Respond with ONLY valid JSON (no markdown, no code fences, no thinking):
{"flagged": true/false, "issues": ["concise name of each issue"], "summary": "1-2 sentence explanation of how this post could mislead readers, or null if clean"}`,
    },
    { role: 'user', content },
  ]);

  try {
    return parseJson(response);
  } catch {
    console.error('Tier 2 parse error:', response);
    return { flagged: false, issues: [], summary: null };
  }
}

async function moderate(env, content) {
  if (content.trim().length < 5) {
    return { status: 'approved', tier1: null, tier2: null };
  }

  let tier1;
  try {
    tier1 = await tier1Check(env, content);
  } catch (err) {
    console.error('Tier 1 moderation error:', err.message);
    return { status: 'unmoderated', tier1: { error: err.message }, tier2: null };
  }

  if (tier1.blocked) {
    return { status: 'blocked', tier1, tier2: null };
  }

  let tier2;
  try {
    tier2 = await tier2Check(env, content);
  } catch (err) {
    console.error('Tier 2 moderation error:', err.message);
    return { status: 'approved', tier1, tier2: { error: err.message } };
  }

  const status = tier2.flagged ? 'flagged' : 'approved';
  return { status, tier1, tier2 };
}

// ── Auth Routes ─────────────────────────────────────────────────────────────

app.get('/login', (c) => {
  return c.html(layout(null, html`
    <div class="auth-page">
      <h1>Chirp</h1>
      <form class="auth-form" method="POST" action="/login">
        <input type="text" name="username" placeholder="Username" required>
        <input type="password" name="password" placeholder="Password" required>
        <button class="btn" type="submit">Log in</button>
        <div class="link"><a href="/register">Create account</a></div>
      </form>
    </div>
  `));
});

app.get('/register', (c) => {
  return c.html(layout(null, html`
    <div class="auth-page">
      <h1>Chirp</h1>
      <form class="auth-form" method="POST" action="/register">
        <input type="text" name="display_name" placeholder="Display Name" required>
        <input type="text" name="username" placeholder="Username" required>
        <input type="password" name="password" placeholder="Password" required>
        <button class="btn" type="submit">Sign up</button>
        <div class="link"><a href="/login">Already have an account?</a></div>
      </form>
    </div>
  `));
});

app.post('/register', async (c) => {
  const body = await c.req.parseBody();
  const { username, display_name, password } = body;
  if (!username || !password || !display_name) {
    return c.html(layout(null, html`
      <div class="auth-page">
        <h1>Chirp</h1>
        <form class="auth-form" method="POST" action="/register">
          <div class="error">All fields required</div>
          <input type="text" name="display_name" placeholder="Display Name" required>
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button class="btn" type="submit">Sign up</button>
          <div class="link"><a href="/login">Already have an account?</a></div>
        </form>
      </div>
    `));
  }

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  const uname = username.toLowerCase().trim();
  const dname = display_name.trim();

  try {
    const result = c.env.DB.prepare(
      'INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?)'
    ).bind(uname, dname, hash, salt);
    const { meta } = await result.run();

    const secret = c.env.SESSION_SECRET || 'dev-secret-change-in-prod';
    const token = await signCookie({ id: meta.last_row_id, username: uname, display_name: dname }, secret);
    setCookie(c, 'session', token, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
    return c.redirect('/');
  } catch (err) {
    return c.html(layout(null, html`
      <div class="auth-page">
        <h1>Chirp</h1>
        <form class="auth-form" method="POST" action="/register">
          <div class="error">Username already taken</div>
          <input type="text" name="display_name" placeholder="Display Name" required>
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button class="btn" type="submit">Sign up</button>
          <div class="link"><a href="/login">Already have an account?</a></div>
        </form>
      </div>
    `));
  }
});

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const { username, password } = body;
  const uname = username?.toLowerCase().trim();

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(uname).first();
  if (!user) {
    return c.html(layout(null, html`
      <div class="auth-page">
        <h1>Chirp</h1>
        <form class="auth-form" method="POST" action="/login">
          <div class="error">Invalid credentials</div>
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button class="btn" type="submit">Log in</button>
          <div class="link"><a href="/register">Create account</a></div>
        </form>
      </div>
    `));
  }

  const hash = await hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) {
    return c.html(layout(null, html`
      <div class="auth-page">
        <h1>Chirp</h1>
        <form class="auth-form" method="POST" action="/login">
          <div class="error">Invalid credentials</div>
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button class="btn" type="submit">Log in</button>
          <div class="link"><a href="/register">Create account</a></div>
        </form>
      </div>
    `));
  }

  const secret = c.env.SESSION_SECRET || 'dev-secret-change-in-prod';
  const token = await signCookie({ id: user.id, username: user.username, display_name: user.display_name }, secret);
  setCookie(c, 'session', token, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
  return c.redirect('/');
});

app.get('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' });
  return c.redirect('/login');
});

// ── Timeline ────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');
  const blocked = c.req.query('blocked');

  const { results: tweets } = await c.env.DB.prepare(
    `SELECT t.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id) as like_count,
      (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id AND user_id = ?) as liked_by_me
    FROM tweets t
    JOIN users u ON t.user_id = u.id
    WHERE t.moderation_status != 'blocked'
    ORDER BY t.created_at DESC
    LIMIT 50`
  ).bind(user.id).all();

  const tweetHtml = tweets.map(t => tweetCard(t, user.id)).join('');

  return c.html(layout(user, html`
    ${blocked ? html`<div class="blocked-notice">Your post was blocked by moderation. It contained content that violates community guidelines.</div>` : ''}
    <div class="compose">
      <form method="POST" action="/tweet">
        <textarea name="content" placeholder="What's happening?" maxlength="280" id="tweet-input"></textarea>
        <div class="compose-footer">
          <span class="char-count"><span id="char-count">0</span>/280</span>
          <button class="btn" type="submit">Post</button>
        </div>
      </form>
    </div>
    ${tweets.length === 0 ? html`<div class="empty-state">No posts yet. Be the first to chirp!</div>` : ''}
    ${raw(tweetHtml)}
    <script>
      const input = document.getElementById('tweet-input');
      const count = document.getElementById('char-count');
      input.addEventListener('input', () => { count.textContent = input.value.length; });
    </script>
  `));
});

// ── Tweet ───────────────────────────────────────────────────────────────────

app.post('/tweet', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');
  const body = await c.req.parseBody();
  const content = body.content?.trim();

  if (!content || content.length === 0) return c.redirect('/');
  if (content.length > 280) return c.redirect('/?error=too_long');

  const result = await moderate(c.env, content);

  await c.env.DB.prepare(
    `INSERT INTO tweets (user_id, content, moderation_status, moderation_tier1, moderation_tier2)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    user.id,
    content,
    result.status,
    JSON.stringify(result.tier1),
    JSON.stringify(result.tier2)
  ).run();

  if (result.status === 'blocked') {
    return c.redirect('/?blocked=1');
  }

  return c.redirect('/');
});

// ── Like ────────────────────────────────────────────────────────────────────

app.post('/like/:id', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');
  const tweetId = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = ?'
  ).bind(user.id, tweetId).first();

  if (existing) {
    await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND tweet_id = ?').bind(user.id, tweetId).run();
  } else {
    await c.env.DB.prepare('INSERT INTO likes (user_id, tweet_id) VALUES (?, ?)').bind(user.id, tweetId).run();
  }

  const referer = c.req.header('referer') || '/';
  return c.redirect(referer);
});

// ── Profile ─────────────────────────────────────────────────────────────────

app.get('/user/:username', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');
  const profileUsername = c.req.param('username');

  const profile = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(profileUsername).first();
  if (!profile) {
    return c.html(layout(user, html`
      <div class="empty-state">
        <h2>User not found</h2>
        <p style="margin-top: 12px;"><a href="/" style="color: #1da1f2;">Go home</a></p>
      </div>
    `), 404);
  }

  const { results: tweets } = await c.env.DB.prepare(
    `SELECT t.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id) as like_count,
      (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id AND user_id = ?) as liked_by_me
    FROM tweets t
    JOIN users u ON t.user_id = u.id
    WHERE t.user_id = ? AND t.moderation_status != 'blocked'
    ORDER BY t.created_at DESC`
  ).bind(user.id, profile.id).all();

  const isFollowing = await c.env.DB.prepare(
    'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
  ).bind(user.id, profile.id).first();

  const followerCount = (await c.env.DB.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').bind(profile.id).first()).c;
  const followingCount = (await c.env.DB.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').bind(profile.id).first()).c;

  const tweetHtml = tweets.map(t => tweetCard(t, user.id)).join('');

  return c.html(layout(user, html`
    <div class="profile-header">
      <h2>${profile.display_name}</h2>
      <span class="tweet-handle">@${profile.username}</span>
      <div class="profile-stats">
        <span><strong>${followerCount}</strong> followers</span>
        <span><strong>${followingCount}</strong> following</span>
        <span><strong>${tweets.length}</strong> posts</span>
      </div>
      ${user.id !== profile.id ? html`
        <div class="profile-actions">
          <form method="POST" action="/follow/${profile.id}">
            <button class="btn btn-sm ${isFollowing ? 'btn-outline' : ''}">${isFollowing ? 'Unfollow' : 'Follow'}</button>
          </form>
        </div>
      ` : ''}
    </div>
    ${tweets.length === 0 ? html`<div class="empty-state">No posts yet.</div>` : ''}
    ${raw(tweetHtml)}
  `));
});

// ── Follow ──────────────────────────────────────────────────────────────────

app.post('/follow/:id', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');
  const targetId = parseInt(c.req.param('id'));

  if (targetId === user.id) {
    const referer = c.req.header('referer') || '/';
    return c.redirect(referer);
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
  ).bind(user.id, targetId).first();

  if (existing) {
    await c.env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(user.id, targetId).run();
  } else {
    await c.env.DB.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').bind(user.id, targetId).run();
  }

  const referer = c.req.header('referer') || '/';
  return c.redirect(referer);
});

// ── Moderation Dashboard ────────────────────────────────────────────────────

app.get('/moderation', async (c) => {
  const redirect = requireAuth(c);
  if (redirect) return redirect;
  const user = c.get('user');

  const { results: flagged } = await c.env.DB.prepare(
    `SELECT t.*, u.username, u.display_name
    FROM tweets t JOIN users u ON t.user_id = u.id
    WHERE t.moderation_status = 'flagged'
    ORDER BY t.created_at DESC`
  ).all();

  const flaggedHtml = flagged.map(tweet => {
    let details = '';
    if (tweet.moderation_tier2) {
      try {
        const t2 = JSON.parse(tweet.moderation_tier2);
        if (t2.issues && t2.issues.length > 0) {
          details += `<p><strong>Issues:</strong> ${t2.issues.map(i => escapeHtml(i)).join(', ')}</p>`;
        }
        if (t2.summary) {
          details += `<p><strong>Analysis:</strong> ${escapeHtml(t2.summary)}</p>`;
        }
      } catch {}
    }

    const date = new Date(tweet.created_at + 'Z').toLocaleDateString();
    return `<div class="mod-tweet">
      <div class="tweet-header">
        <a href="/user/${escapeHtml(tweet.username)}" class="tweet-author">${escapeHtml(tweet.display_name)}</a>
        <span class="tweet-handle">@${escapeHtml(tweet.username)}</span>
        <span class="badge badge-flagged">Flagged</span>
        <span class="tweet-time">${date}</span>
      </div>
      <div class="tweet-content">${escapeHtml(tweet.content)}</div>
      <div class="mod-details">${details}</div>
    </div>`;
  }).join('');

  return c.html(layout(user, html`
    <div class="mod-header">
      <h2>Moderation Dashboard</h2>
      <p style="color: #8899a6; margin-top: 4px;">Posts flagged for logical fallacies or manipulation</p>
    </div>
    ${flagged.length === 0 ? html`<div class="empty-state">No flagged posts. All clear!</div>` : ''}
    ${raw(flaggedHtml)}
  `));
});

export default app;
