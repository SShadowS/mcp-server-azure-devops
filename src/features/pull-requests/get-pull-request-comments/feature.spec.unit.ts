import { WebApi } from 'azure-devops-node-api';
import { getPullRequestComments } from './feature';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('getPullRequestComments', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const makeConnection = (mockGitApi: any): any => ({
    getGitApi: jest.fn().mockResolvedValue(mockGitApi),
  });

  const baseOptions = {
    projectId: 'test-project',
    repositoryId: 'test-repo',
    pullRequestId: 123,
  };

  test('should return slim comment threads with file path and line number', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1, // Active
        threadContext: {
          filePath: '/src/app.ts',
          rightFileStart: { line: 10, offset: 5 },
          rightFileEnd: { line: 10, offset: 15 },
        },
        comments: [
          {
            id: 100,
            content: 'This code needs refactoring',
            commentType: 1, // CodeChange -> "text"
            author: { displayName: 'Test User', id: 'test-user-id' },
            publishedDate: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 101,
            parentCommentId: 100,
            content: 'I agree, will update',
            commentType: 1,
            author: { displayName: 'Another User', id: 'another-user-id' },
            publishedDate: new Date('2026-01-02T00:00:00Z'),
          },
        ],
      },
    ];

    const mockGitApi = {
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    };
    const conn = makeConnection(mockGitApi);

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      baseOptions,
    );

    expect(result).toHaveLength(1);
    expect(result[0].threadId).toBe(1);
    expect(result[0].status).toBe('active');
    expect(result[0].filePath).toBe('/src/app.ts');
    expect(result[0].lineNumber).toBe(10);
    expect(result[0].comments).toHaveLength(2);
    expect(result[0].comments[0]).toEqual({
      id: 100,
      author: 'Test User',
      content: 'This code needs refactoring',
      date: '2026-01-01T00:00:00.000Z',
      commentType: 'text',
    });
    expect(result[0].comments[1].parentCommentId).toBe(100);
    // Verify no _links, avatar, etc.
    expect(result[0]).not.toHaveProperty('_links');
    expect(result[0]).not.toHaveProperty('threadContext');
    expect(result[0].comments[0]).not.toHaveProperty('_links');
    expect(result[0].comments[0]).not.toHaveProperty('author.imageUrl');
  });

  test('should filter out system comments by default', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        comments: [
          {
            id: 100,
            content: 'Good code!',
            commentType: 1, // Text
            author: { displayName: 'Reviewer' },
            publishedDate: new Date(),
          },
          {
            id: 101,
            content: 'Policy status has been updated',
            commentType: 3, // System
            author: { displayName: 'System' },
            publishedDate: new Date(),
          },
        ],
      },
      {
        id: 2,
        status: 1,
        comments: [
          {
            id: 200,
            content: 'Reviewer voted',
            commentType: 3, // System only thread
            author: { displayName: 'System' },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      baseOptions,
    );

    // Thread 1 should have only the human comment
    expect(result).toHaveLength(1);
    expect(result[0].comments).toHaveLength(1);
    expect(result[0].comments[0].content).toBe('Good code!');
    // Thread 2 is excluded entirely (only had system comments)
  });

  test('should return system comments when commentType is "all"', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        comments: [
          {
            id: 100,
            content: 'Human comment',
            commentType: 1,
            author: { displayName: 'User' },
            publishedDate: new Date(),
          },
          {
            id: 101,
            content: 'System comment',
            commentType: 3, // System
            author: { displayName: 'System' },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      { ...baseOptions, commentType: 'all' },
    );

    expect(result[0].comments).toHaveLength(2);
  });

  test('should filter threads by status', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1, // active
        comments: [
          {
            id: 100,
            content: 'Active thread',
            commentType: 1,
            author: { displayName: 'User' },
            publishedDate: new Date(),
          },
        ],
      },
      {
        id: 2,
        status: 2, // fixed
        comments: [
          {
            id: 200,
            content: 'Fixed thread',
            commentType: 1,
            author: { displayName: 'User' },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      { ...baseOptions, status: 'active' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].threadId).toBe(1);
  });

  test('should use leftFileStart line when rightFileStart is not available', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        threadContext: {
          filePath: '/src/app.ts',
          leftFileStart: { line: 5, offset: 1 },
        },
        comments: [
          {
            id: 100,
            content: 'Comment on deleted line',
            commentType: 1,
            author: { displayName: 'User' },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      baseOptions,
    );

    expect(result[0].lineNumber).toBe(5);
    expect(result[0].filePath).toBe('/src/app.ts');
  });

  test('should return a specific thread when threadId is provided', async () => {
    const mockThread: GitPullRequestCommentThread = {
      id: 42,
      status: 1,
      threadContext: {
        filePath: '/src/utils.ts',
        rightFileStart: { line: 15, offset: 1 },
      },
      comments: [
        {
          id: 100,
          content: 'Specific comment',
          commentType: 1,
          author: { displayName: 'Test User' },
          publishedDate: new Date(),
        },
      ],
    };

    const mockGitApi = {
      getThreads: jest.fn(),
      getPullRequestThread: jest.fn().mockResolvedValue(mockThread),
    };
    const conn = makeConnection(mockGitApi);

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      { ...baseOptions, threadId: 42 },
    );

    expect(result).toHaveLength(1);
    expect(result[0].threadId).toBe(42);
    expect(result[0].filePath).toBe('/src/utils.ts');
    expect(result[0].lineNumber).toBe(15);
    expect(mockGitApi.getPullRequestThread).toHaveBeenCalledWith(
      'test-repo',
      123,
      42,
      'test-project',
    );
    expect(mockGitApi.getThreads).not.toHaveBeenCalled();
  });

  test('should handle pagination with top parameter', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      {
        id: 1,
        status: 1,
        comments: [
          {
            id: 100,
            content: 'C1',
            commentType: 1,
            author: { displayName: 'U' },
            publishedDate: new Date(),
          },
        ],
      },
      {
        id: 2,
        status: 1,
        comments: [
          {
            id: 101,
            content: 'C2',
            commentType: 1,
            author: { displayName: 'U' },
            publishedDate: new Date(),
          },
        ],
      },
      {
        id: 3,
        status: 1,
        comments: [
          {
            id: 102,
            content: 'C3',
            commentType: 1,
            author: { displayName: 'U' },
            publishedDate: new Date(),
          },
        ],
      },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      { ...baseOptions, top: 2 },
    );

    expect(result).toHaveLength(2);
  });

  test('should handle error when API call fails', async () => {
    const conn = makeConnection({
      getThreads: jest.fn().mockRejectedValue(new Error('API error')),
    });

    await expect(
      getPullRequestComments(
        conn as WebApi,
        'test-project',
        'test-repo',
        123,
        baseOptions,
      ),
    ).rejects.toThrow('Failed to get pull request comments: API error');
  });

  test('should handle threads with no comments', async () => {
    const mockThreads: GitPullRequestCommentThread[] = [
      { id: 1, status: 1, comments: undefined as any },
    ];

    const conn = makeConnection({
      getThreads: jest.fn().mockResolvedValue(mockThreads),
      getPullRequestThread: jest.fn(),
    });

    const result = await getPullRequestComments(
      conn as WebApi,
      'test-project',
      'test-repo',
      123,
      baseOptions,
    );

    // Thread with no comments should be filtered out
    expect(result).toHaveLength(0);
  });
});
