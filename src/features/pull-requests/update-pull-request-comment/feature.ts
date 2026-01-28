import { WebApi } from 'azure-devops-node-api';
import { Comment } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { UpdateCommentResponse } from '../types';
import { transformCommentType } from '../../../shared/enums';

/**
 * Update an existing comment on a pull request thread
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param pullRequestId The ID of the pull request
 * @param threadId The ID of the thread containing the comment
 * @param commentId The ID of the comment to update
 * @param content The new content for the comment
 * @returns The updated comment
 */
export async function updatePullRequestComment(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  pullRequestId: number,
  threadId: number,
  commentId: number,
  content: string,
): Promise<UpdateCommentResponse> {
  try {
    const gitApi = await connection.getGitApi();

    // Create comment object with new content
    const comment: Comment = {
      content,
    };

    const updatedComment = await gitApi.updateComment(
      comment,
      repositoryId,
      pullRequestId,
      threadId,
      commentId,
      projectId,
    );

    if (!updatedComment) {
      throw new Error('Failed to update pull request comment');
    }

    return {
      comment: {
        ...updatedComment,
        commentType: transformCommentType(updatedComment.commentType),
      },
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to update pull request comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
