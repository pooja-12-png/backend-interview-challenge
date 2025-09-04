import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';
import { SyncService } from './syncService';

export class TaskService {
  constructor(private db: Database, private syncService: SyncService) {}

  // ✅ Create Task
  async createTask(taskData: Partial<Task>): Promise<Task> {
    const now = new Date().toISOString();

    const task: Task = {
      id: uuidv4(),
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      completed: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      lastSyncedAt: null,
      serverId: null,
    };

    await this.db.insertTask(task);
    await this.syncService.addToSyncQueue(task.id, 'create', task);

    return task;
  }

  // ✅ Update Task
  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const task = await this.db.getTaskById(id);
    if (!task || task.isDeleted) return null;

    const now = new Date().toISOString();

    const updated: Task = {
      ...task,
      ...updates,
      updatedAt: now,
      syncStatus: 'pending',
    };

    await this.db.updateTask(id, updated);
    await this.syncService.addToSyncQueue(id, 'update', updated);

    return updated;
  }

  // ✅ Delete Task (soft delete)
  async deleteTask(id: string): Promise<boolean> {
    const task = await this.db.getTaskById(id);
    if (!task || task.isDeleted) return false;

    const now = new Date().toISOString();

    const updated: Task = {
      ...task,
      isDeleted: true,
      updatedAt: now,
      syncStatus: 'pending',
    };

    await this.db.updateTask(id, updated);
    await this.syncService.addToSyncQueue(id, 'delete', updated);

    return true;
  }

  // ✅ Get single task
  async getTask(id: string): Promise<Task | null> {
    const task = await this.db.getTaskById(id);
    if (!task || task.isDeleted) return null;
    return task;
  }

  // ✅ Get all non-deleted tasks
  async getAllTasks(): Promise<Task[]> {
    const tasks = await this.db.getAllTasks();
    return tasks.filter((t) => !t.isDeleted);
  }

  // ✅ Get tasks needing sync
  async getTasksNeedingSync(): Promise<Task[]> {
    return await this.db.getTasksByStatus(['pending', 'error']);
  }
}
