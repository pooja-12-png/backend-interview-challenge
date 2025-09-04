import axios from 'axios';
import {
  Task,
  SyncQueueItem,
  SyncResult,
  BatchSyncRequest,
  BatchSyncResponse,
} from '../types';
import { Database } from '../db/database';
import { TaskService } from './taskService';

export class SyncService {
  private apiUrl: string;
  private batchSize: number;

  constructor(
    private db: Database,
    private taskService: TaskService,
    apiUrl: string = process.env.API_BASE_URL || 'http://localhost:3000/api'
  ) {
    this.apiUrl = apiUrl;
    this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '10', 10);
  }

  // ✅ Main sync orchestration
  async sync(): Promise<SyncResult> {
    const queueItems = await this.db.getSyncQueueItems();
    let successCount = 0;
    let errorCount = 0;

    // split into batches
    for (let i = 0; i < queueItems.length; i += this.batchSize) {
      const batch = queueItems.slice(i, i + this.batchSize);

      try {
        const response = await this.processBatch(batch);
        for (const res of response.results) {
          if (res.success) {
            await this.updateSyncStatus(res.taskId, 'synced', res.serverData);
            successCount++;
          } else {
            const item = batch.find((it) => it.taskId === res.taskId);
            if (item) {
              await this.handleSyncError(item, new Error(res.error || 'Sync error'));
            }
            errorCount++;
          }
        }
      } catch (err) {
        // mark whole batch as error
        for (const item of batch) {
          await this.handleSyncError(item, err as Error);
        }
        errorCount += batch.length;
      }
    }

    return { successCount, errorCount, total: queueItems.length };
  }

  // ✅ Add operation to sync queue
  async addToSyncQueue(
    taskId: string,
    operation: 'create' | 'update' | 'delete',
    data: Partial<Task>
  ): Promise<void> {
    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID(),
      taskId,
      operation,
      data: JSON.stringify(data),
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.db.insertSyncQueueItem(queueItem);
  }

  // ✅ Process batch
  private async processBatch(items: SyncQueueItem[]): Promise<BatchSyncResponse> {
    const request: BatchSyncRequest = {
      items: items.map((item) => ({
        taskId: item.taskId,
        operation: item.operation,
        data: JSON.parse(item.data),
      })),
    };

    const { data } = await axios.post<BatchSyncResponse>(
      `${this.apiUrl}/tasks/sync`,
      request
    );

    return data;
  }

  // ✅ Conflict resolution (last-write-wins)
  private async resolveConflict(localTask: Task, serverTask: Task): Promise<Task> {
    if (new Date(localTask.updatedAt) > new Date(serverTask.updatedAt)) {
      console.log(`Conflict resolved: keeping local version for task ${localTask.id}`);
      return localTask;
    } else {
      console.log(`Conflict resolved: keeping server version for task ${serverTask.id}`);
      return serverTask;
    }
  }

  // ✅ Update task sync status
  private async updateSyncStatus(
    taskId: string,
    status: 'synced' | 'error',
    serverData?: Partial<Task>
  ): Promise<void> {
    const updates: Partial<Task> = {
      syncStatus: status,
      lastSyncedAt: new Date().toISOString(),
    };

    if (serverData?.id) {
      updates.serverId = serverData.id;
    }

    await this.taskService.updateTask(taskId, updates);

    if (status === 'synced') {
      await this.db.removeFromSyncQueue(taskId);
    }
  }

  // ✅ Handle sync errors
  private async handleSyncError(item: SyncQueueItem, error: Error): Promise<void> {
    item.retryCount += 1;
    await this.db.updateSyncQueueItem(item.id, {
      retryCount: item.retryCount,
      lastError: error.message,
    });

    if (item.retryCount > 3) {
      await this.updateSyncStatus(item.taskId, 'error');
      await this.db.removeFromSyncQueue(item.taskId);
    }
  }

  // ✅ Connectivity check (already done)
  async checkConnectivity(): Promise<boolean> {
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
