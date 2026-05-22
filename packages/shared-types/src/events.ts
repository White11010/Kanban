export interface TaskCreatedEvent {
  type: "task.created";
  taskId: string;
  workspaceId: string;
  assigneeId: string | null;
  title: string;
}
export interface TaskUpdatedEvent {
  type: "task.updated";
  taskId: string;
  workspaceId: string;
  assigneeId: string | null;
  title: string;
}
export interface TaskDeletedEvent {
  type: "task.deleted";
  taskId: string;
}
export type TaskEvent = TaskCreatedEvent | TaskUpdatedEvent | TaskDeletedEvent;
