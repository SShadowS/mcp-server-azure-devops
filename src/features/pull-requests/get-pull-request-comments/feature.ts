import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetPullRequestCommentsOptions,
  SlimThread,
  SlimComment,
} from '../types';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

/**
 * Get comments from a pull request
 *
 * Returns a slim response structure to minimize token usage.
 * By default, filters out system comments (e.g. "Policy status has been updated").
 */
export async function getPullRequestComments(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  pullRequestId: number,
  options: GetPullRequestCommentsOptions,
): Promise<SlimThread[]> {
  try {
    const gitApi = await connection.getGitApi();
    const commentTypeFilter = options.commentType ?? 'text';
    const statusFilter = options.status ?? 'all';

    let threads: GitPullRequestCommentThread[];

    if (options.threadId) {
      const thread = await gitApi.getPullRequestThread(
        repositoryId,
        pullRequestId,
        options.threadId,
        projectId,
      );
      threads = thread ? [thread] : [];
    } else {
      threads =
        (await gitApi.getThreads(
          repositoryId,
          pullRequestId,
          projectId,
          undefined,
          options.includeDeleted ? 1 : undefined,
        )) || [];
    }

    // Filter by thread status
    if (statusFilter !== 'all') {
      threads = threads.filter((thread) => {
        const status = transformCommentThreadStatus(thread.status);
        return status === statusFilter;
      });
    }

    // Transform to slim structure and filter comments
    const slimThreads = threads
      .map((thread) => toSlimThread(thread, commentTypeFilter))
      .filter((thread) => thread.comments.length > 0);

    if (options.top) {
      return slimThreads.slice(0, options.top);
    }
    return slimThreads;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Transform a raw API thread into a slim structure, filtering comments by type.
 */
function toSlimThread(
  thread: GitPullRequestCommentThread,
  commentTypeFilter: 'all' | 'text' | 'system',
): SlimThread {
  const lineNumber =
    thread.threadContext?.rightFileStart?.line ??
    thread.threadContext?.leftFileStart?.line;

  const comments: SlimComment[] = (thread.comments || [])
    .filter((comment) => {
      if (commentTypeFilter === 'all') return true;
      const type = transformCommentType(comment.commentType);
      if (commentTypeFilter === 'text') return type !== 'system';
      return type === 'system';
    })
    .map((comment) => {
      const slim: SlimComment = {
        id: comment.id,
        author: comment.author?.displayName ?? 'Unknown',
        authorEmail: comment.author?.uniqueName,
        content: comment.content,
        date:
          comment.publishedDate?.toISOString?.() ??
          comment.publishedDate?.toString(),
        commentType: transformCommentType(comment.commentType),
      };
      if (comment.parentCommentId) {
        slim.parentCommentId = comment.parentCommentId;
      }
      return slim;
    });

  return {
    threadId: thread.id,
    status: transformCommentThreadStatus(thread.status),
    filePath: thread.threadContext?.filePath,
    lineNumber,
    comments,
  };
}
