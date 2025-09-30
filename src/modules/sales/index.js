const { Router } = require('express');
const router = Router();

router.get('/sale-orders', (req, res) => res.json({ data: [] }));

module.exports = router;


