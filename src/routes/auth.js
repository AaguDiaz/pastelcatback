const express = require('express');
const router = express.Router();
const { login } = require('../services/authservice');


router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
