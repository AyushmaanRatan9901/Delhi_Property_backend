const { runAutomatedRentWorkflow } = require('../controllers/notificationAutomationController');

let schedulerInterval = null;

/**
 * Start Automated Rent Workflow Scheduler
 * Runs periodically to evaluate due dates, trigger notifications, and flag overdue rents
 */
const startRentScheduler = (intervalMs = 3600000) => { // Default: 1 hour
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log('⏱️ [RentScheduler] Background automated rent notification engine started.');

  // Run initial check after 10 seconds of startup
  setTimeout(async () => {
    try {
      console.log('🔄 [RentScheduler] Running initial automated rent cycle check...');
      const res = await runAutomatedRentWorkflow();
      console.log(`✅ [RentScheduler] Initial cycle completed. Dispatched: ${res.totalDispatched || 0}`);
    } catch (err) {
      console.error('❌ [RentScheduler] Error during initial cycle check:', err.message);
    }
  }, 10000);

  // Periodic recurring timer
  schedulerInterval = setInterval(async () => {
    try {
      console.log('🔄 [RentScheduler] Running periodic automated rent cycle check...');
      const res = await runAutomatedRentWorkflow();
      console.log(`✅ [RentScheduler] Cycle completed. Dispatched: ${res.totalDispatched || 0}`);
    } catch (err) {
      console.error('❌ [RentScheduler] Error in periodic rent check:', err.message);
    }
  }, intervalMs);
};

const stopRentScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 [RentScheduler] Background automated rent scheduler stopped.');
  }
};

module.exports = {
  startRentScheduler,
  stopRentScheduler,
};
