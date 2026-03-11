import axios, { AxiosError } from 'axios';
import { WebApi } from 'azure-devops-node-api';
import { getAuthorizationHeader } from '../../../clients/azure-devops';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';

interface WorkItemCommentAuthor {
  displayName: string;
  uniqueName: string;
  id?: string;
  imageUrl?: string;
}

export interface WorkItemComment {
  workItemId: number;
  id: number;
  version: number;
  text: string;
  createdBy: WorkItemCommentAuthor;
  createdDate: string;
  modifiedBy: WorkItemCommentAuthor;
  modifiedDate: string;
}

export interface WorkItemCommentsResult {
  totalCount: number;
  count: number;
  comments: WorkItemComment[];
}

export interface GetWorkItemCommentsOptions {
  workItemId: number;
  projectId: string;
  top?: number;
  orderBy?: 'asc' | 'desc';
}

/**
 * Get discussion comments for a work item.
 *
 * Uses the Work Item Comments REST API (7.1-preview.4) since the
 * azure-devops-node-api SDK does not expose this endpoint.
 */
export async function getWorkItemComments(
  connection: WebApi,
  options: GetWorkItemCommentsOptions,
): Promise<WorkItemCommentsResult> {
  const { workItemId, projectId, top, orderBy } = options;
  const baseUrl = connection.serverUrl;

  const url = `${baseUrl}/${encodeURIComponent(projectId)}/_apis/wit/workItems/${workItemId}/comments`;

  const params: Record<string, string | number> = {
    'api-version': '7.1-preview.4',
  };
  if (top !== undefined) {
    params['$top'] = top;
  }
  if (orderBy !== undefined) {
    params.order = orderBy;
  }

  try {
    const authHeader = await getAuthorizationHeader();

    const response = await axios.get<WorkItemCommentsResult>(url, {
      params,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    const axiosError = error as AxiosError;
    if (axiosError.response) {
      const status = axiosError.response.status;
      const errorData = axiosError.response.data as
        | { message?: string }
        | undefined;
      const errorMessage = errorData?.message || axiosError.message;

      if (status === 404) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item '${workItemId}' not found or has no comments endpoint`,
        );
      }
      if (status === 401 || status === 403) {
        throw new AzureDevOpsPermissionError(
          `Permission denied to access comments for work item '${workItemId}'`,
        );
      }
      throw new AzureDevOpsError(
        `Failed to get work item comments: ${errorMessage}`,
      );
    }

    throw new AzureDevOpsError(
      `Network error when getting work item comments: ${axiosError.message}`,
    );
  }
}
