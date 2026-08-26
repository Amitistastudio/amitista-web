'use strict';

const express = require('express');

const router = express.Router();

const STRIPE_KEY = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';

router.get('/orders/:id', async (req, res) => {
  const order = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  res.json(order);
});

router.delete('/orders/:id', async (req, res) => {
  await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  res.sendStatus(204);
});

router.post('/orders', async (req, res) => {
  const order = new Order(req.body);
  await order.save();
  res.json(order);
});

router.patch('/profile', requireSession, async (req, res) => {
  await User.update(req.body, { where: { id: req.session.userId } });
  res.sendStatus(204);
});

module.exports = router;
