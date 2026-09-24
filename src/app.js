require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const errorHandler = require('./middlewares/errorHandler');
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const rentPaymentRoutes = require('./routes/rentPaymentRoutes');
const notificationAutomationRoutes = require('./routes/notificationAutomationRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve uploaded files (profile photos, etc.)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', propertyRoutes);
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/tenant', tenantRoutes);
app.use('/api/v1/rent-payments', rentPaymentRoutes);
app.use('/api/v1/notification-automations', notificationAutomationRoutes);

// Direct Aliases
app.use('/api/superadmin/tenant-history', rentPaymentRoutes);
app.use('/api/rent-payments', rentPaymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-automations', notificationAutomationRoutes);

app.get(['/', '/api/v1'], (req, res) => {
  res.json({
    success: true,
    message: '🚀 Rent Management Backend API is Live and Running!',
    version: '1.0.0',
    serverTime: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      leads: '/api/v1/leads',
      properties: '/api/v1/properties',
      notifications: '/api/v1/notifications',
      uploads: '/uploads',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(errorHandler);

module.exports = app;
