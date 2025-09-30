const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { errorHandler } = require('./core/middlewares/errorHandler');
const routes = require('./routes');
const { mountDocs } = require('./docs');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api', routes);

mountDocs(app);

app.use(errorHandler);

module.exports = { app };
