'use strict';

const express = require('express');
const { exec } = require('child_process');
const usersRouter = require('./routes/users');
const ordersRouter = require('./routes/orders');

const app = express();

app.use(express.json());
app.use('/api', usersRouter);
app.use('/shop', ordersRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/admin/run', requireAdmin, (req, res) => {
  const command = req.body.command;
  exec(`sh -c ${command}`, (err, out) => res.send(out));
});

app.get('/page/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.query(`SELECT * FROM pages WHERE id = ${id}`);
  res.end();
});

module.exports = app;
