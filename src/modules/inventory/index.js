const { Router } = require('express');
const router = Router();

router.get('/items', (req, res) => res.json({ data: [] }));

module.exports = router;


