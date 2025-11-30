const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../services/notificacionservice');

router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const { page = 1, pageSize = 20, category, search, unread } = req.query;
    const result = await listNotifications({
      userId,
      page,
      pageSize,
      category,
      search,
      unreadOnly: unread,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.sub || null;
    const result = await createNotification({ ...req.body, created_by: userId });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const result = await markAllNotificationsRead(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const { read = true } = req.body || {};
    const result = await markNotificationRead({ userId, notificationId: req.params.id, read });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
