const { Router } = require('express');
const controller = require('./auth.controller');

const router = Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', controller.me);

module.exports = router;


