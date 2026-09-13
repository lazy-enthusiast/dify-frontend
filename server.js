const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = process.env.DB_PATH || '/data/db.sqlite';
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '新对话',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    role TEXT,
    text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.post('/api/conversations', (req, res) => {
  const r = db.prepare('INSERT INTO conversations DEFAULT VALUES').run();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(r.lastInsertRowid);
  res.json(conv);
});

app.get('/api/conversations', (req, res) => {
  res.json(db.prepare('SELECT * FROM conversations ORDER BY id DESC').all());
});

app.get('/api/conversations/:id/messages', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id)
  );
});

app.post('/api/run', async (req, res) => {
  const { conversation_id, text } = req.body;
  try {
    db.prepare('INSERT INTO messages (conversation_id, role, text) VALUES (?, ?, ?)')
      .run(conversation_id, 'user', text);

    const count = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?')
      .get(conversation_id).c;
    if (count === 1) {
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?')
        .run(text.slice(0, 20), conversation_id);
    }

    const hist = db.prepare('SELECT role, text FROM messages WHERE conversation_id = ? ORDER BY id ASC')
      .all(conversation_id);
    const history = hist.map(m => `${m.role === 'user' ? '使用者' : 'AI'}: ${m.text}`).join('\n');

    const r = await fetch('https://api.dify.ai/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: { query: text, history },
        response_mode: 'blocking',
        user: 'web-user'
      })
    });
    const data = await r.json();
    const reply = data?.data?.outputs?.answer || data?.data?.outputs?.text || JSON.stringify(data);

    db.prepare('INSERT INTO messages (conversation_id, role, text) VALUES (?, ?, ?)')
      .run(conversation_id, 'bot', reply);

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`running on ${port}`));
