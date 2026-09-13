const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      title TEXT DEFAULT '新对话',
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id),
      role TEXT,
      text TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}
initDb();

app.post('/api/conversations', async (req, res) => {
  const r = await pool.query('INSERT INTO conversations DEFAULT VALUES RETURNING *');
  res.json(r.rows[0]);
});

app.get('/api/conversations', async (req, res) => {
  const r = await pool.query('SELECT * FROM conversations ORDER BY id DESC');
  res.json(r.rows);
});

app.get('/api/conversations/:id/messages', async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY id ASC',
    [req.params.id]
  );
  res.json(r.rows);
});

app.post('/api/run', async (req, res) => {
  const { conversation_id, text } = req.body;
  try {
    await pool.query(
      'INSERT INTO messages (conversation_id, role, text) VALUES ($1, $2, $3)',
      [conversation_id, 'user', text]
    );

    // set conversation title from first message
    const countR = await pool.query('SELECT COUNT(*) FROM messages WHERE conversation_id = $1', [conversation_id]);
    if (countR.rows[0].count == 1) {
      await pool.query('UPDATE conversations SET title = $1 WHERE id = $2', [text.slice(0, 20), conversation_id]);
    }

    const histR = await pool.query(
      'SELECT role, text FROM messages WHERE conversation_id = $1 ORDER BY id ASC',
      [conversation_id]
    );
    const history = histR.rows.map(m => `${m.role === 'user' ? '使用者' : 'AI'}: ${m.text}`).join('\n');

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

    await pool.query(
      'INSERT INTO messages (conversation_id, role, text) VALUES ($1, $2, $3)',
      [conversation_id, 'bot', reply]
    );

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`running on ${port}`));
