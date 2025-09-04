import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { SyncService } from '../services/syncService';
import { Database } from '../db/database';

export function createTaskRouter(db: Database): Router {
  const router = Router();

  // ⚡ Setup TaskService + SyncService properly
  let taskService: TaskService;
  let syncService: SyncService;

  taskService = new TaskService(db, {} as SyncService);
  syncService = new SyncService(db, taskService);
  (taskService as any).syncService = syncService; // inject back reference

  // ✅ Get all tasks
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // ✅ Get single task
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // ✅ Create task
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const task = await taskService.createTask({ title, description });
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // ✅ Update task
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { title, description, completed } = req.body;
      const task = await taskService.updateTask(req.params.id, {
        title,
        description,
        completed,
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // ✅ Delete task
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await taskService.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return router;
}
