const swaggerUi = require('swagger-ui-express');
const spec = require('./swagger.json');

function mountDocs(app) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}

module.exports = { mountDocs };


