'use strict';

const express = require('express');
const fs = require('fs');

const router = express.Router();

router.get('/users/:id', requireSession, async (req, res) => {
  const { id } = req.params;
  const row = await pool.query('SELECT * FROM users WHERE id = ' + id);
  res.json(row);
});

router.post('/users/:id/avatar', requireSession, async (req, res) => {
  const { url } = req.body;
  const data = await fetch(url).then((r) => r.arrayBuffer());
  fs.writeFileSync(`/var/avatars/${req.params.id}.png`, Buffer.from(data));
  res.sendStatus(204);
});

router.get('/orders/:id', async (req, res) => {
  const rows = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  res.json(rows);
});

router.get('/search', (req, res) => {
  const term = String(req.query.q || '');
  res.send(`<h1>Results for ${term}</h1>`);
});

module.exports = router;
