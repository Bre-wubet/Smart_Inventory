const { queue: stockReorderQueue } = require('./stockReorder.job');
const { queue: reportGeneratorQueue } = require('./reportGenerator.job');

function startJobs() {
  // schedule placeholders
  stockReorderQueue.add({}, { repeat: { cron: '*/15 * * * *' } });
  reportGeneratorQueue.add({}, { repeat: { cron: '0 0 * * *' } });
}

module.exports = { startJobs };


