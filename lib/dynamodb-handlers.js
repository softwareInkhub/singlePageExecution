import { 
  PutCommand
} from "@aws-sdk/lib-dynamodb";
import { client, docClient } from './dynamodb-client.js';

export const handlers = {
  // Table Operations
  async createTable(c, req, res) {
    try {
      console.log('[DynamoDB] Creating table:', c.request.requestBody);
      const command = new CreateTableCommand(c.request.requestBody);
      const response = await client.send(command);
      return {
        statusCode: 201,
        body: {
          message: 'Table created successfully',
          table: response.TableDescription
        }
      };
    } catch (error) {
      console.error('Error creating table:', error);
      return {
        statusCode: 500,
        body: { 
          error: 'Failed to create table',
          details: error.message
        }
      };
    }
  },

  // Item Operations
  async createItem(c, req, res) {
    try {
      const tableName = c.request.params.tableName;
      if (!tableName) {
        return {
          statusCode: 400,
          body: { error: 'Table name is required' }
        };
      }

      console.log('[DynamoDB] Creating item in table:', tableName);
      const command = new PutCommand({
        TableName: tableName,
        Item: c.request.requestBody
      });
      await docClient.send(command);
      return {
        statusCode: 201,
        body: {
          message: 'Item created successfully',
          item: c.request.requestBody
        }
      };
    } catch (error) {
      console.error('Error creating item:', error);
      return {
        statusCode: 500,
        body: { 
          error: 'Failed to create item',
          details: error.message
        }
      };
    }
  }
}; 