import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';

export function createSyncRouter(db: Database): Router {
  const router = Router();

  // ✅ Create service instances
  let taskService: TaskService;
  let syncService: SyncService;

  // Avoid circular dependency: first create syncService with placeholders
  taskService = new TaskService(db, {} as SyncService);
  syncService = new SyncService(db, taskService);
  // Now link taskService back to syncService
  (taskService as any).syncService = syncService;

  // ✅ Trigger manual sync
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const connected = await syncService.checkConnectivity();
      if (!connected) {
        return res.status(503).json({ error: 'Server not reachable' });
      }

      const result = await syncService.sync();
      res.json({ message: 'Sync completed', result });
    } catch (err: any) {
      console.error('Sync failed:', err);
      res.status(500).json({ error: 'Sync failed', details: err.message });
    }
  });

  // ✅ Check sync status
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const queueItems = await db.getSyncQueueItems();
      const pendingCount = queueItems.length;
      const lastSync = await db.getLastSyncTimestamp();
      const connected = await syncService.checkConnectivity();

      res.json({
        pendingCount,
        lastSync,
        connected,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get sync status', details: err.message });
    }
  });

  // ✅ Batch sync endpoint (server-side)
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      // Normally, this is implemented on the "server API" (not client)
      // For demo, just echo back request
      const { items } = req.body;
      if (!items) {
        return res.status(400).json({ error: 'No items provided' });
      }

      // Simulate processing: just mark all as success
      const results = items.map((it: any) => ({
        taskId: it.taskId,
        success: true,
        serverData: { ...it.data, id: it.taskId },
      }));

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: 'Batch sync failed', details: err.message });
    }
  });

  // ✅ Health check endpoint
  router.get('/health', async (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
