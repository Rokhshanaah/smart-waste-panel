import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import collectionsRoutes from './routes/collections.routes.js';
import crudRoutes from './routes/crud.routes.js';
import { pool, testDatabaseConnection } from './config/db.js';
import { errorHandler, notFound } from './middleware/error.js';
import { ensureFinanceTables } from './utils/ensureFinanceTables.js';
import { ensureGeoTables } from './utils/ensureGeoTables.js';
import geoRoutes from './routes/geo.routes.js';

dotenv.config();

const app = express();

app.use(helmet());
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api', crudRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    await testDatabaseConnection();
    await ensureFinanceTables();
    await ensureGeoTables();

    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Unable to connect to MySQL:');
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
