const { Router } = require('express');
const router = Router();

router.get('/recipes', (req, res) => res.json({ data: [] }));

module.exports = router;


