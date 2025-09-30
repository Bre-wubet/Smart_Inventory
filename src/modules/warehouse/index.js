const { Router } = require('express');
const router = Router();

router.get('/warehouses', (req, res) => res.json({ data: [] }));

module.exports = router;


