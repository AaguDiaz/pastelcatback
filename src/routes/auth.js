const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  login,
  changePasswordAfterFirstLogin,
  requestPasswordReset,
} = require('../services/authservice');

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/set-password', authenticateToken, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user?.sub;
    const result = await changePasswordAfterFirstLogin(userId, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
