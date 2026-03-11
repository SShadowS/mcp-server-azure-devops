import axios from 'axios';
import { getWorkItemComments } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';

jest.mock('axios');
jest.mock('../../../clients/azure-devops', () => ({
  getAuthorizationHeader: jest.fn().mockResolvedValue('Basic dGVzdDp0ZXN0'),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('getWorkItemComments unit', () => {
  const mockConnection: any = {
    serverUrl: 'https://dev.azure.com/test-org',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return comments for a work item', async () => {
    // Arrange
    const mockResponse = {
      data: {
        totalCount: 2,
        count: 2,
        comments: [
          {
            workItemId: 123,
            id: 1,
            version: 1,
            text: '<p>First comment</p>',
            createdBy: { displayName: 'User A', uniqueName: 'usera@test.com' },
            createdDate: '2026-03-01T10:00:00Z',
            modifiedBy: { displayName: 'User A', uniqueName: 'usera@test.com' },
            modifiedDate: '2026-03-01T10:00:00Z',
          },
          {
            workItemId: 123,
            id: 2,
            version: 1,
            text: '<p>Second comment</p>',
            createdBy: { displayName: 'User B', uniqueName: 'userb@test.com' },
            createdDate: '2026-03-02T10:00:00Z',
            modifiedBy: { displayName: 'User B', uniqueName: 'userb@test.com' },
            modifiedDate: '2026-03-02T10:00:00Z',
          },
        ],
      },
    };
    mockedAxios.get.mockResolvedValue(mockResponse);

    // Act
    const result = await getWorkItemComments(mockConnection, {
      workItemId: 123,
      projectId: 'TestProject',
    });

    // Assert
    expect(result.totalCount).toBe(2);
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0].text).toBe('<p>First comment</p>');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://dev.azure.com/test-org/TestProject/_apis/wit/workItems/123/comments',
      expect.objectContaining({
        params: expect.objectContaining({
          'api-version': '7.1-preview.4',
        }),
      }),
    );
  });

  test('should pass top and orderBy params when provided', async () => {
    // Arrange
    mockedAxios.get.mockResolvedValue({
      data: { totalCount: 0, count: 0, comments: [] },
    });

    // Act
    await getWorkItemComments(mockConnection, {
      workItemId: 123,
      projectId: 'TestProject',
      top: 5,
      orderBy: 'desc',
    });

    // Assert
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          $top: 5,
          order: 'desc',
        }),
      }),
    );
  });

  test('should throw AzureDevOpsResourceNotFoundError on 404', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue({
      response: { status: 404, data: { message: 'Not found' } },
      message: 'Request failed with status code 404',
    });

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        workItemId: 999,
        projectId: 'TestProject',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should throw AzureDevOpsPermissionError on 403', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue({
      response: { status: 403, data: { message: 'Forbidden' } },
      message: 'Request failed with status code 403',
    });

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        workItemId: 123,
        projectId: 'TestProject',
      }),
    ).rejects.toThrow(AzureDevOpsPermissionError);
  });

  test('should throw AzureDevOpsError on network error', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue({
      message: 'Network Error',
    });

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        workItemId: 123,
        projectId: 'TestProject',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('should propagate AzureDevOpsError as-is', async () => {
    // Arrange
    mockedAxios.get.mockRejectedValue(new AzureDevOpsError('Custom error'));

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        workItemId: 123,
        projectId: 'TestProject',
      }),
    ).rejects.toThrow('Custom error');
  });
});
