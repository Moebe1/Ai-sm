const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./lib/db');
const { moderate } = require('./lib/moderation');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
  })
);

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// --- Auth Routes ---

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  const { username, display_name, password } = req.body;
  if (!username || !password || !display_name) {
    return res.render('register', { error: 'All fields required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username.toLowerCase().trim(), display_name.trim(), hash);
    req.session.user = { id: result.lastInsertRowid, username, display_name };
    res.redirect('/');
  } catch (err) {
    res.render('register', { error: 'Username already taken' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username?.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.render('login', { error: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, username: user.username, display_name: user.display_name };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// --- Tweet Routes ---

app.get('/', requireAuth, (req, res) => {
  const tweets = db
    .prepare(
      `SELECT t.*, u.username, u.display_name,
        (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id) as like_count,
        (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id AND user_id = ?) as liked_by_me
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      WHERE t.moderation_status != 'blocked'
      ORDER BY t.created_at DESC
      LIMIT 50`
    )
    .all(req.session.user.id);

  res.render('timeline', { tweets });
});

app.post('/tweet', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim().length === 0) return res.redirect('/');
  if (content.length > 280) return res.redirect('/?error=too_long');

  // Run two-tier moderation
  const result = await moderate(content.trim());

  db.prepare(
    `INSERT INTO tweets (user_id, content, moderation_status, moderation_tier1, moderation_tier2)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    req.session.user.id,
    content.trim(),
    result.status,
    JSON.stringify(result.tier1),
    JSON.stringify(result.tier2)
  );

  if (result.status === 'blocked') {
    return res.redirect('/?blocked=1');
  }

  res.redirect('/');
});

app.post('/like/:id', requireAuth, (req, res) => {
  const tweetId = parseInt(req.params.id);
  const userId = req.session.user.id;
  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = ?').get(userId, tweetId);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND tweet_id = ?').run(userId, tweetId);
  } else {
    db.prepare('INSERT INTO likes (user_id, tweet_id) VALUES (?, ?)').run(userId, tweetId);
  }
  res.redirect('back');
});

// --- Profile & Follow Routes ---

app.get('/user/:username', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!profile) return res.status(404).render('error', { message: 'User not found' });

  const tweets = db
    .prepare(
      `SELECT t.*, u.username, u.display_name,
        (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id) as like_count,
        (SELECT COUNT(*) FROM likes WHERE tweet_id = t.id AND user_id = ?) as liked_by_me
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      WHERE t.user_id = ? AND t.moderation_status != 'blocked'
      ORDER BY t.created_at DESC`
    )
    .all(req.session.user.id, profile.id);

  const isFollowing = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(req.session.user.id, profile.id);

  const followerCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(profile.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(profile.id).c;

  res.render('profile', { profile, tweets, isFollowing: !!isFollowing, followerCount, followingCount });
});

app.post('/follow/:id', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.session.user.id) return res.redirect('back');

  const existing = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(req.session.user.id, targetId);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.session.user.id, targetId);
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.session.user.id, targetId);
  }
  res.redirect('back');
});

// --- Moderation Dashboard (view flagged content) ---

app.get('/moderation', requireAuth, (req, res) => {
  const flagged = db
    .prepare(
      `SELECT t.*, u.username, u.display_name
      FROM tweets t JOIN users u ON t.user_id = u.id
      WHERE t.moderation_status = 'flagged'
      ORDER BY t.created_at DESC`
    )
    .all();

  res.render('moderation', { flagged });
});

app.listen(PORT, () => {
  console.log(`Twitter clone running at http://localhost:${PORT}`);
  if (!process.env.OLLAMA_API_KEY) {
    console.log('WARNING: OLLAMA_API_KEY not set. Set it to enable LLM moderation.');
  }
});
