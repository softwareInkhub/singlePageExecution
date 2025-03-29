import { v4 as uuidv4 } from 'uuid';
import { handlers as dynamodbHandlers } from './lib/dynamodb-handlers.js';

// Execution status constants
const EXECUTION_STATUS = {
  STARTED: 'started',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Handler to save execution logs
export const saveExecutionLog = async ({
  execId,
  childExecId,
  data,
  isParent = false
}) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Format item IDs as DynamoDB list type
    const formattedItemIds = (data.itemIds || []).map(id => ({
      S: id.toString() // Convert each ID to string type for DynamoDB
    }));

    const logItem = {
      'exec-id': execId,
      'child-exec-id': childExecId,
      data: {
        'execution-id': execId,
        'iteration-no': data.iterationNo || 0,
        'total-items-processed': data.totalItemsProcessed || 0,
        'items-in-current-page': data.itemsInCurrentPage || 0,
        'request-url': data.requestUrl,
        'response-status': data.responseStatus,
        'pagination-type': data.paginationType || 'none',
        'timestamp': timestamp,
        'is-last': data.isLast || false,
        'item-ids': {
          L: formattedItemIds // Use DynamoDB list type for item IDs
        }
      }
    };

    // Only add status field for parent execution logs
    if (isParent) {
      logItem.data.status = data.status || EXECUTION_STATUS.STARTED;
    }

    console.log('Saving execution log with item IDs:', {
      execId,
      childExecId,
      itemIdsCount: formattedItemIds.length,
      itemIds: formattedItemIds
    });

    const response = await dynamodbHandlers.createItem({
      request: {
        params: {
          tableName: 'executions'
        },
        requestBody: logItem
      }
    });

    if (!response.ok) {
      console.error('Failed to save execution log:', response);
      return null;
    }

    return logItem;
  } catch (error) {
    console.error('Error saving execution log:', error);
    return null;
  }
};

// Handler to save single execution log
export const saveSingleExecutionLog = async ({
  execId,
  method,
  url,
  queryParams,
  headers,
  responseStatus,
  responseData
}) => {
  try {
    const parentExecId = execId;
    await saveExecutionLog({
      execId: parentExecId,
      childExecId: parentExecId, // Same as execId for parent
      data: {
        requestUrl: url,
        responseStatus,
        paginationType: 'single',
        status: EXECUTION_STATUS.COMPLETED,
        isLast: true,
        totalItemsProcessed: responseData ? 1 : 0,
        itemsInCurrentPage: responseData ? 1 : 0
      },
      isParent: true
    });

    return parentExecId;
  } catch (error) {
    console.error('Error saving single execution log:', error);
    return null;
  }
}; 