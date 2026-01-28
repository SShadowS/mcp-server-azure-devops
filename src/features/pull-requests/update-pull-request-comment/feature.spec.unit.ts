import { WebApi } from 'azure-devops-node-api';
import { updatePullRequestComment } from './feature';
import {
  Comment,
  CommentType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';

describe('updatePullRequestComment', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should update a comment successfully', async () => {
    // Arrange
    const mockUpdatedComment: Comment = {
      id: 101,
      content: 'Updated comment content',
      commentType: CommentType.Text,
      author: {
        displayName: 'Test User',
        id: 'test-user-id',
      },
      publishedDate: new Date(),
      lastUpdatedDate: new Date(),
    };

    const mockGitApi = {
      updateComment: jest.fn().mockResolvedValue(mockUpdatedComment),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const commentId = 101;
    const content = 'Updated comment content';

    // Act
    const result = await updatePullRequestComment(
      mockConnection as WebApi,
      projectId,
      repositoryId,
      pullRequestId,
      threadId,
      commentId,
      content,
    );

    // Assert
    expect(result).toEqual({
      comment: {
        ...mockUpdatedComment,
        commentType: 'text',
      },
    });
    expect(mockConnection.getGitApi).toHaveBeenCalledTimes(1);
    expect(mockGitApi.updateComment).toHaveBeenCalledTimes(1);
    expect(mockGitApi.updateComment).toHaveBeenCalledWith(
      { content },
      repositoryId,
      pullRequestId,
      threadId,
      commentId,
      projectId,
    );
  });

  test('should throw error when updateComment returns null', async () => {
    // Arrange
    const mockGitApi = {
      updateComment: jest.fn().mockResolvedValue(null),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const commentId = 101;
    const content = 'Updated comment content';

    // Act & Assert
    await expect(
      updatePullRequestComment(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        pullRequestId,
        threadId,
        commentId,
        content,
      ),
    ).rejects.toThrow('Failed to update pull request comment');
  });

  test('should propagate AzureDevOpsError', async () => {
    // Arrange
    const mockGitApi = {
      updateComment: jest
        .fn()
        .mockRejectedValue(new AzureDevOpsError('Custom error')),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const commentId = 101;
    const content = 'Updated comment content';

    // Act & Assert
    await expect(
      updatePullRequestComment(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        pullRequestId,
        threadId,
        commentId,
        content,
      ),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('should wrap unexpected errors with descriptive message', async () => {
    // Arrange
    const errorMessage = 'API connection failed';
    const mockGitApi = {
      updateComment: jest.fn().mockRejectedValue(new Error(errorMessage)),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const projectId = 'test-project';
    const repositoryId = 'test-repo';
    const pullRequestId = 123;
    const threadId = 456;
    const commentId = 101;
    const content = 'Updated comment content';

    // Act & Assert
    await expect(
      updatePullRequestComment(
        mockConnection as WebApi,
        projectId,
        repositoryId,
        pullRequestId,
        threadId,
        commentId,
        content,
      ),
    ).rejects.toThrow(`Failed to update pull request comment: ${errorMessage}`);
  });
});
